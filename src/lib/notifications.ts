import { db } from "@/db";
import { events, eventNotifications, guilds } from "@/db/schema";
import { and, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

export type NotificationKind = "day" | "hour" | "twenty_min" | "voice_dm";

// "Chat" kinds post into the guild's text channel; the poller picks the
// *smallest* fitting chat kind per cycle (so T-10 reports "twenty_min", not
// "hour"). "voice_dm" is independent — see findPending(): a single squad at
// T-10 can emit both a twenty_min channel post AND a voice_dm at the same
// time, gated by separate idempotency rows.
type ChatKind = Exclude<NotificationKind, "voice_dm">;

const CHAT_WINDOW_MS: Record<ChatKind, number> = {
  twenty_min: 25 * 60 * 1000,
  hour: 75 * 60 * 1000,
  day: 25 * 60 * 60 * 1000,
};
// Voice DMs aim for T-10; we accept anywhere in [0, 15] min so a missed poll
// (bot restart) still fires the reminder before kickoff rather than dropping
// it. Window is intentionally narrow — the T-20 channel post already gave
// broad notice; this one is a last-minute personal nudge.
const VOICE_DM_WINDOW_MS = 15 * 60 * 1000;

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
export type NotificationTarget = {
  eventId: string;
  eventName: string;
  squadNumber: 0 | 1 | 2;
  squadLabel: string | null;
  startsAt: string;
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
  kind: "match" | "simple" | "scrim";
  gameTime: string | null;
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

  const rows: CandidateRow[] = await db
    .select({
      eventId: events.id,
      eventName: events.name,
      guildId: events.guildId,
      channelId: guilds.discordChannelId,
      kind: events.kind,
      gameTime: events.gameTime,
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
        // At least one start timestamp lands in the day window.
        or(
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

    for (const c of candidates) {
      if (!c.startsAt) continue;
      const ms = new Date(c.startsAt).getTime() - now.getTime();

      const chatKind = pickKind(ms);
      if (chatKind && !alreadySent(row.eventId, c.squadNumber, chatKind)) {
        targets.push({
          eventId: row.eventId,
          eventName: row.eventName,
          squadNumber: c.squadNumber,
          squadLabel: c.squadLabel,
          startsAt: c.startsAt,
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
          squadNumber: c.squadNumber,
          squadLabel: c.squadLabel,
          startsAt: c.startsAt,
          guildId: row.guildId,
          channelId: row.channelId,
          kind: "voice_dm",
          voiceChannelId: c.voiceChannelId,
        });
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

export function buildMessage(t: NotificationTarget, now = new Date()): string {
  const ms = new Date(t.startsAt).getTime() - now.getTime();
  const when = formatTimeUntil(ms);
  const subject = t.squadLabel
    ? `${t.eventName} — ${t.squadLabel}`
    : t.eventName;
  return `@everyone **${subject}** ${when}.`;
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
