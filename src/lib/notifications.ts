import { db } from "@/db";
import { events, eventNotifications, guilds } from "@/db/schema";
import { and, eq, gt, inArray, isNotNull, isNull, lte } from "drizzle-orm";

export type NotificationKind = "day" | "hour" | "twenty_min";

// Window upper-bounds (ms before gameTime). The poll picks the *smallest*
// kind that still fits — so an event 10 min away is reported as "twenty_min"
// not "hour". Generous upper bounds let us catch events even after a missed
// tick (e.g. bot was offline through the exact 24h mark).
const WINDOW_MS: Record<NotificationKind, number> = {
  twenty_min: 25 * 60 * 1000,
  hour: 75 * 60 * 1000,
  day: 25 * 60 * 60 * 1000,
};

export function pickKind(msUntilGame: number): NotificationKind | null {
  if (msUntilGame <= 0) return null;
  if (msUntilGame <= WINDOW_MS.twenty_min) return "twenty_min";
  if (msUntilGame <= WINDOW_MS.hour) return "hour";
  if (msUntilGame <= WINDOW_MS.day) return "day";
  return null;
}

// Human-readable "starts in N min/hours/tomorrow" used in the message body.
// Pure — easy to test.
export function formatTimeUntil(msUntilGame: number): string {
  const minutes = Math.round(msUntilGame / (60 * 1000));
  if (minutes <= 1) return "starting now";
  if (minutes < 60) return `starts in ${minutes} minutes`;
  const hours = Math.round(msUntilGame / (60 * 60 * 1000));
  if (hours === 1) return "starts in 1 hour";
  if (hours < 20) return `starts in ${hours} hours`;
  return "starts tomorrow";
}

export type PendingNotification = {
  eventId: string;
  eventName: string;
  gameTime: string;
  guildId: string;
  channelId: string;
  kind: NotificationKind;
};

// Returns events whose game time is in one of the notification windows AND
// whose guild has a Discord channel configured AND for which we haven't
// already sent that kind. The bot loop calls this every poll.
export async function findPending(now = new Date()): Promise<PendingNotification[]> {
  const horizonIso = new Date(now.getTime() + WINDOW_MS.day).toISOString();
  const nowIso = now.toISOString();

  // Candidate events: not deleted, gameTime set, gameTime in (now, now+25h],
  // guild has channel configured.
  const rows = await db
    .select({
      eventId: events.id,
      eventName: events.name,
      gameTime: events.gameTime,
      guildId: events.guildId,
      channelId: guilds.discordChannelId,
    })
    .from(events)
    .innerJoin(guilds, eq(events.guildId, guilds.id))
    .where(
      and(
        isNull(events.deletedAt),
        isNotNull(events.gameTime),
        isNotNull(guilds.discordChannelId),
        isNull(guilds.deletedAt),
        gt(events.gameTime, nowIso),
        lte(events.gameTime, horizonIso)
      )
    );

  if (rows.length === 0) return [];

  const eventIds = rows.map((r) => r.eventId);
  const sent = await db
    .select()
    .from(eventNotifications)
    .where(inArray(eventNotifications.eventId, eventIds));

  const sentByEvent = new Map<string, Set<NotificationKind>>();
  for (const s of sent) {
    let set = sentByEvent.get(s.eventId);
    if (!set) {
      set = new Set<NotificationKind>();
      sentByEvent.set(s.eventId, set);
    }
    set.add(s.kind);
  }

  const pending: PendingNotification[] = [];
  for (const row of rows) {
    if (!row.channelId || !row.gameTime) continue;
    const ms = new Date(row.gameTime).getTime() - now.getTime();
    const kind = pickKind(ms);
    if (!kind) continue;
    if (sentByEvent.get(row.eventId)?.has(kind)) continue;
    pending.push({
      eventId: row.eventId,
      eventName: row.eventName,
      gameTime: row.gameTime,
      guildId: row.guildId,
      channelId: row.channelId,
      kind,
    });
  }
  return pending;
}

// Atomically marks a (eventId, kind) as sent. Returns true if this call
// inserted the row, false if it was already there (race-safe via PK).
export function recordSent(eventId: string, kind: NotificationKind): boolean {
  try {
    db.insert(eventNotifications)
      .values({ eventId, kind, sentAt: new Date().toISOString() })
      .run();
    return true;
  } catch (err) {
    // SqliteError: UNIQUE constraint failed → another tick beat us, skip.
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

// Wipe sent-record rows for an event so the bot's next poll re-evaluates from
// scratch. Called when an event's gameTime changes — notifications already
// fired for the old time are stale, and we want the bot to consider the new
// time fresh. The bot's window logic naturally ignores kinds whose window has
// already passed for the new time, so this is safe even for last-minute moves.
export function clearNotifications(eventId: string): void {
  db.delete(eventNotifications)
    .where(eq(eventNotifications.eventId, eventId))
    .run();
}

export function buildMessage(p: PendingNotification, now = new Date()): string {
  const ms = new Date(p.gameTime).getTime() - now.getTime();
  const when = formatTimeUntil(ms);
  return `@everyone **${p.eventName}** ${when}.`;
}
