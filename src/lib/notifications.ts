import { db } from "@/db";
import { events, eventNotifications, guilds } from "@/db/schema";
import { and, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

export type NotificationKind = "day" | "hour" | "twenty_min";

// Window upper-bounds (ms before startsAt). The poll picks the *smallest*
// kind that still fits — so an event 10 min away is reported as "twenty_min"
// not "hour". Generous upper bounds let us catch events even after a missed
// tick (e.g. bot was offline through the exact 24h mark).
const WINDOW_MS: Record<NotificationKind, number> = {
  twenty_min: 25 * 60 * 1000,
  hour: 75 * 60 * 1000,
  day: 25 * 60 * 60 * 1000,
};

export function pickKind(msUntilStart: number): NotificationKind | null {
  if (msUntilStart <= 0) return null;
  if (msUntilStart <= WINDOW_MS.twenty_min) return "twenty_min";
  if (msUntilStart <= WINDOW_MS.hour) return "hour";
  if (msUntilStart <= WINDOW_MS.day) return "day";
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
// events emit a single target with squadNumber=0 / squadLabel=null.
export type NotificationTarget = {
  eventId: string;
  eventName: string;
  squadNumber: 0 | 1 | 2;
  squadLabel: string | null;
  startsAt: string;
  guildId: string;
  channelId: string;
  kind: NotificationKind;
};

type CandidateRow = {
  eventId: string;
  eventName: string;
  guildId: string;
  channelId: string | null;
  kind: "match" | "simple";
  gameTime: string | null;
  squad1Name: string;
  squad2Name: string;
  squad1StartsAt: string | null;
  squad2StartsAt: string | null;
};

export async function findPending(now = new Date()): Promise<NotificationTarget[]> {
  const horizonIso = new Date(now.getTime() + WINDOW_MS.day).toISOString();
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

    const candidates: { squadNumber: 0 | 1 | 2; squadLabel: string | null; startsAt: string | null }[] =
      row.kind === "match"
        ? [
            { squadNumber: 1, squadLabel: row.squad1Name, startsAt: row.squad1StartsAt },
            { squadNumber: 2, squadLabel: row.squad2Name, startsAt: row.squad2StartsAt },
          ]
        : [{ squadNumber: 0, squadLabel: null, startsAt: row.gameTime }];

    for (const c of candidates) {
      if (!c.startsAt) continue;
      const ms = new Date(c.startsAt).getTime() - now.getTime();
      const kind = pickKind(ms);
      if (!kind) continue;
      if (alreadySent(row.eventId, c.squadNumber, kind)) continue;
      targets.push({
        eventId: row.eventId,
        eventName: row.eventName,
        squadNumber: c.squadNumber,
        squadLabel: c.squadLabel,
        startsAt: c.startsAt,
        guildId: row.guildId,
        channelId: row.channelId,
        kind,
      });
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
