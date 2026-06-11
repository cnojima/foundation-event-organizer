import { db } from "@/db";
import { events, eventNotifications, guilds } from "@/db/schema";
import { and, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

export type NotificationKind =
  | "day"
  | "hour"
  | "twenty_min"
  | "voice_dm"
  | "end_thirty_min"
  | "end_five_min";

// "Chat" kinds post into the guild's text channel; the poller picks the
// *smallest* fitting chat kind per cycle (so T-10 reports "twenty_min", not
// "hour"). "voice_dm" and end-time kinds are independent.
type ChatKind = Exclude<NotificationKind, "voice_dm" | "end_thirty_min" | "end_five_min">;

// Windows are exactly equal to their target times: with 1-min polling the
// notification fires within 1 minute of the named threshold.
const CHAT_WINDOW_MS: Record<ChatKind, number> = {
  twenty_min: 20 * 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};
const VOICE_DM_WINDOW_MS = 10 * 60 * 1000;

type EndKind = "end_five_min" | "end_thirty_min";
const END_CHAT_WINDOW_MS: Record<EndKind, number> = {
  end_five_min: 5 * 60 * 1000,
  end_thirty_min: 30 * 60 * 1000,
};

export function pickEndKind(msUntilEnd: number): EndKind | null {
  if (msUntilEnd <= 0) return null;
  if (msUntilEnd <= END_CHAT_WINDOW_MS.end_five_min) return "end_five_min";
  if (msUntilEnd <= END_CHAT_WINDOW_MS.end_thirty_min) return "end_thirty_min";
  return null;
}

export function pickKind(msUntilStart: number): ChatKind | null {
  if (msUntilStart <= 0) return null;
  if (msUntilStart <= CHAT_WINDOW_MS.twenty_min) return "twenty_min";
  if (msUntilStart <= CHAT_WINDOW_MS.hour) return "hour";
  if (msUntilStart <= CHAT_WINDOW_MS.day) return "day";
  return null;
}

// Human-readable "starts in N min/hours/tomorrow" used in the message body.
export function formatTimeUntil(msUntilStart: number): string {
  const minutes = Math.round(msUntilStart / (60 * 1000));
  if (minutes <= 1) return "starting now";
  if (minutes < 60) return `starts in ${minutes} minutes`;
  const hours = Math.round(msUntilStart / (60 * 60 * 1000));
  if (hours === 1) return "starts in 1 hour";
  if (hours < 20) return `starts in ${hours} hours`;
  return "starts tomorrow";
}

// One reminder we owe Discord. Match events emit one target per squad; simple
// events emit a single target with squadNumber=0 / squadLabel=null. For
// kind === "voice_dm", voiceChannelId is set (the per-squad VC the bot DMs
// squadmates to join) and the bot dispatches per-user DMs instead of a
// channel post. For all other kinds voiceChannelId is null.
export type EventKind = "match" | "simple" | "scrim";

export type NotificationTarget = {
  eventId: string;
  eventName: string;
  eventKind: EventKind;
  squadNumber: 0 | 1 | 2;
  squadLabel: string | null;
  startsAt: string;
  endsAt: string | null;
  guildId: string;
  channelId: string;
  kind: NotificationKind;
  voiceChannelId: string | null;
};

type CandidateRow = {
  eventId: string;
  eventName: string;
  guildId: string;
  channelId: string | null;
  kind: EventKind;
  gameTime: string | null;
  durationMinutes: number | null;
  squad1Name: string;
  squad2Name: string;
  squad1StartsAt: string | null;
  squad2StartsAt: string | null;
  squad1VoiceChannelId: string | null;
  squad2VoiceChannelId: string | null;
};

export async function findPending(now = new Date()): Promise<NotificationTarget[]> {
  const horizonIso = new Date(now.getTime() + CHAT_WINDOW_MS.day).toISOString();
  const nowIso = now.toISOString();
  // Look back far enough to catch any in-progress event whose end time is
  // still approaching. Max duration is 1440 min; add the largest end-reminder
  // window (35 min) as a buffer.
  const endLookbackIso = new Date(
    now.getTime() - (1440 + 35) * 60_000
  ).toISOString();

  const rows: CandidateRow[] = await db
    .select({
      eventId: events.id,
      eventName: events.name,
      guildId: events.guildId,
      channelId: guilds.discordChannelId,
      kind: events.kind,
      gameTime: events.gameTime,
      durationMinutes: events.durationMinutes,
      squad1Name: events.squad1Name,
      squad2Name: events.squad2Name,
      squad1StartsAt: events.squad1StartsAt,
      squad2StartsAt: events.squad2StartsAt,
      squad1VoiceChannelId: guilds.squad1VoiceChannelId,
      squad2VoiceChannelId: guilds.squad2VoiceChannelId,
    })
    .from(events)
    .innerJoin(guilds, eq(events.guildId, guilds.id))
    .where(
      and(
        isNull(events.deletedAt),
        isNull(guilds.deletedAt),
        isNotNull(guilds.discordChannelId),
        or(
          // Upcoming start: within the day window.
          and(
            isNotNull(events.gameTime),
            gt(events.gameTime, nowIso),
            lte(events.gameTime, horizonIso)
          ),
          and(
            isNotNull(events.squad1StartsAt),
            gt(events.squad1StartsAt, nowIso),
            lte(events.squad1StartsAt, horizonIso)
          ),
          and(
            isNotNull(events.squad2StartsAt),
            gt(events.squad2StartsAt, nowIso),
            lte(events.squad2StartsAt, horizonIso)
          ),
          // In-progress: started recently and has a duration (end reminders).
          and(
            isNotNull(events.durationMinutes),
            isNotNull(events.gameTime),
            gt(events.gameTime, endLookbackIso),
            lte(events.gameTime, nowIso)
          ),
          and(
            isNotNull(events.durationMinutes),
            isNotNull(events.squad1StartsAt),
            gt(events.squad1StartsAt, endLookbackIso),
            lte(events.squad1StartsAt, nowIso)
          ),
          and(
            isNotNull(events.durationMinutes),
            isNotNull(events.squad2StartsAt),
            gt(events.squad2StartsAt, endLookbackIso),
            lte(events.squad2StartsAt, nowIso)
          )
        )
      )
    );

  if (rows.length === 0) return [];

  const eventIds = rows.map((r) => r.eventId);
  const sent = await db
    .select()
    .from(eventNotifications)
    .where(inArray(eventNotifications.eventId, eventIds));

  // sent: { (eventId): { (squad): Set<kind> } }
  const sentMap = new Map<string, Map<number, Set<NotificationKind>>>();
  for (const s of sent) {
    let bySquad = sentMap.get(s.eventId);
    if (!bySquad) {
      bySquad = new Map();
      sentMap.set(s.eventId, bySquad);
    }
    let kinds = bySquad.get(s.squad);
    if (!kinds) {
      kinds = new Set();
      bySquad.set(s.squad, kinds);
    }
    kinds.add(s.kind);
  }

  function alreadySent(
    eventId: string,
    squadNumber: number,
    kind: NotificationKind
  ): boolean {
    return sentMap.get(eventId)?.get(squadNumber)?.has(kind) === true;
  }

  const targets: NotificationTarget[] = [];

  for (const row of rows) {
    if (!row.channelId) continue;

    const candidates: {
      squadNumber: 0 | 1 | 2;
      squadLabel: string | null;
      startsAt: string | null;
      voiceChannelId: string | null;
    }[] =
      row.kind === "match"
        ? [
            {
              squadNumber: 1,
              squadLabel: row.squad1Name,
              startsAt: row.squad1StartsAt,
              voiceChannelId: row.squad1VoiceChannelId,
            },
            {
              squadNumber: 2,
              squadLabel: row.squad2Name,
              startsAt: row.squad2StartsAt,
              voiceChannelId: row.squad2VoiceChannelId,
            },
          ]
        : // simple & scrim share one start time and one announcement.
          [{ squadNumber: 0, squadLabel: null, startsAt: row.gameTime, voiceChannelId: null }];

    const endsAtMs = row.durationMinutes ? row.durationMinutes * 60_000 : null;

    for (const c of candidates) {
      if (!c.startsAt) continue;
      const ms = new Date(c.startsAt).getTime() - now.getTime();
      const endsAt = endsAtMs
        ? new Date(new Date(c.startsAt).getTime() + endsAtMs).toISOString()
        : null;

      const chatKind = pickKind(ms);
      if (chatKind && !alreadySent(row.eventId, c.squadNumber, chatKind)) {
        targets.push({
          eventId: row.eventId,
          eventName: row.eventName,
          eventKind: row.kind,
          squadNumber: c.squadNumber,
          squadLabel: c.squadLabel,
          startsAt: c.startsAt,
          endsAt,
          guildId: row.guildId,
          channelId: row.channelId,
          kind: chatKind,
          voiceChannelId: null,
        });
      }

      // Voice DM: match events only, voice channel must be configured, and the
      // start must fall inside the [0, 15] min window. Independent of the
      // chat kind — both can fire on the same poll tick.
      if (
        row.kind === "match" &&
        c.voiceChannelId &&
        ms > 0 &&
        ms <= VOICE_DM_WINDOW_MS &&
        !alreadySent(row.eventId, c.squadNumber, "voice_dm")
      ) {
        targets.push({
          eventId: row.eventId,
          eventName: row.eventName,
          eventKind: row.kind,
          squadNumber: c.squadNumber,
          squadLabel: c.squadLabel,
          startsAt: c.startsAt,
          endsAt,
          guildId: row.guildId,
          channelId: row.channelId,
          kind: "voice_dm",
          voiceChannelId: c.voiceChannelId,
        });
      }

      // End-time reminders: only when the event has a duration set.
      if (endsAt) {
        const msUntilEnd = new Date(endsAt).getTime() - now.getTime();
        const endKind = pickEndKind(msUntilEnd);
        if (endKind && !alreadySent(row.eventId, c.squadNumber, endKind)) {
          targets.push({
            eventId: row.eventId,
            eventName: row.eventName,
            eventKind: row.kind,
            squadNumber: c.squadNumber,
            squadLabel: c.squadLabel,
            startsAt: c.startsAt,
            endsAt,
            guildId: row.guildId,
            channelId: row.channelId,
            kind: endKind,
            voiceChannelId: null,
          });
        }
      }
    }
  }
  return targets;
}

// Wipe sent-record rows for an event so the bot's next poll re-evaluates from
// scratch. Called when any of the event's start timestamps change. The bot's
// window logic naturally ignores kinds whose window has already passed for
// the new times, so this is safe even for last-minute moves.
export function clearNotifications(eventId: string): void {
  db.delete(eventNotifications)
    .where(eq(eventNotifications.eventId, eventId))
    .run();
}

// Atomically marks (eventId, squadNumber, kind) as sent. Returns true if this
// call inserted the row, false if a concurrent tick beat us (PK collision).
export function recordSent(
  eventId: string,
  squadNumber: number,
  kind: NotificationKind
): boolean {
  try {
    db.insert(eventNotifications)
      .values({ eventId, squad: squadNumber, kind, sentAt: new Date().toISOString() })
      .run();
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "SQLITE_CONSTRAINT_PRIMARYKEY"
    ) {
      return false;
    }
    throw err;
  }
}

export function buildMessage(t: NotificationTarget): string {
  const subject = t.squadLabel
    ? `${t.eventName} — ${t.squadLabel}`
    : t.eventName;
  const isEnd = t.kind === "end_thirty_min" || t.kind === "end_five_min";
  if (isEnd && t.endsAt) {
    const unix = Math.floor(new Date(t.endsAt).getTime() / 1000);
    return `@everyone **${subject}** ends <t:${unix}:R> — <t:${unix}:F>`;
  }
  const unix = Math.floor(new Date(t.startsAt).getTime() / 1000);
  return `@everyone **${subject}** starts <t:${unix}:R> — <t:${unix}:F>`;
}

function formatTimeUntilEnd(msUntilEnd: number): string {
  const minutes = Math.round(msUntilEnd / (60 * 1000));
  if (minutes <= 1) return "ending now";
  if (minutes < 60) return `ends in ${minutes} minutes`;
  const hours = Math.round(msUntilEnd / (60 * 60 * 1000));
  if (hours === 1) return "ends in 1 hour";
  return `ends in ${hours} hours`;
}

// Generic translator callback (decoupled from any specific i18n backend).
// The bot supplies a closure backed by src/bot/i18n.ts; tests can stub it
// with `(k) => k`. Keys are relative to the `bot` namespace.
export type LocalizedTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

// Per-user DM body for the voice_dm reminder. `<#channelId>` renders as a
// clickable join link in Discord. Plain text — no embeds — to match the rest
// of the bot's voice. The trailing hint surfaces the opt-out path so this
// DM is never a dead-end for players who find it intrusive.
//
// Per-recipient locale is supplied via the translator — the caller looks up
// each recipient's users.locale and constructs a translator scoped to it
// before calling here.
export function buildVoiceDmMessage(
  target: NotificationTarget,
  t: LocalizedTranslator,
  now = new Date()
): string {
  const ms = new Date(target.startsAt).getTime() - now.getTime();
  const when = formatVoiceDmLead(ms, t);
  const subject = target.squadLabel
    ? `${target.eventName} — ${target.squadLabel}`
    : target.eventName;
  const link = target.voiceChannelId ? `<#${target.voiceChannelId}>` : "";
  return [
    t("voiceDm.body", { subject, when, link }),
    t("voiceDm.optOutHint"),
  ].join("\n");
}

// Mirrors the boundaries in formatTimeUntil() but emits localized strings
// through the translator instead of fixed English. Kept here (rather than
// in src/bot/i18n.ts) so the voice DM builder owns its full output shape.
function formatVoiceDmLead(
  msUntilStart: number,
  t: LocalizedTranslator
): string {
  const minutes = Math.round(msUntilStart / (60 * 1000));
  if (minutes <= 1) return t("voiceDm.leadStartingNow");
  if (minutes < 60) return t("voiceDm.leadMinutes", { minutes });
  const hours = Math.round(msUntilStart / (60 * 60 * 1000));
  if (hours === 1) return t("voiceDm.leadOneHour");
  if (hours < 20) return t("voiceDm.leadHours", { hours });
  return t("voiceDm.leadTomorrow");
}
