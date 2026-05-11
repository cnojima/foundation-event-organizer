import { db } from "@/db";
import { duelProposals, duelNotifications } from "@/db/schema";
import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";

export type DuelReminderKind = "day" | "hour" | "twenty_min";

// Mirror of src/lib/notifications.ts WINDOW_MS — but smaller surface
// since duels have only one timestamp (proposed_game_time) and no
// per-squad split. Generous upper bounds let us catch duels even after a
// missed poll tick.
const WINDOW_MS: Record<DuelReminderKind, number> = {
  twenty_min: 25 * 60 * 1000,
  hour: 75 * 60 * 1000,
  day: 25 * 60 * 60 * 1000,
};

// Picks the smallest applicable reminder window for a given lead time.
// Returns null if the duel is already in the past or further than 24h+
// away.
export function pickKind(msUntilStart: number): DuelReminderKind | null {
  if (msUntilStart <= 0) return null;
  if (msUntilStart <= WINDOW_MS.twenty_min) return "twenty_min";
  if (msUntilStart <= WINDOW_MS.hour) return "hour";
  if (msUntilStart <= WINDOW_MS.day) return "day";
  return null;
}

// Single reminder we owe both duelers. The poller resolves each player's
// linked Discord ID + DM-preference when actually dispatching; this row
// just identifies which duel needs which kind sent next.
export type DuelReminderTarget = {
  duelId: string;
  proposingUserId: string;
  opposingUserId: string;
  proposedGameTime: string;
  location: string;
  winCondition: string;
  kind: DuelReminderKind;
};

// Returns duels whose proposed_game_time falls inside the 24h horizon AND
// whose smallest applicable reminder hasn't already been recorded as
// sent. Cancelled/declined/withdrawn duels are skipped (status !=
// accepted), as are duels with a declared result (those are over).
export async function findPendingDuels(
  now = new Date()
): Promise<DuelReminderTarget[]> {
  const horizonIso = new Date(now.getTime() + WINDOW_MS.day).toISOString();
  const nowIso = now.toISOString();

  const rows = await db
    .select({
      id: duelProposals.id,
      proposingUserId: duelProposals.proposingUserId,
      opposingUserId: duelProposals.opposingUserId,
      proposedGameTime: duelProposals.proposedGameTime,
      location: duelProposals.location,
      winCondition: duelProposals.winCondition,
    })
    .from(duelProposals)
    .where(
      and(
        eq(duelProposals.status, "accepted"),
        isNull(duelProposals.result),
        gt(duelProposals.proposedGameTime, nowIso),
        lte(duelProposals.proposedGameTime, horizonIso)
      )
    );

  if (rows.length === 0) return [];

  // Load every notification row for these duels so we can dedupe in JS.
  const duelIds = rows.map((r) => r.id);
  const sent = await db
    .select()
    .from(duelNotifications)
    .where(inArray(duelNotifications.duelId, duelIds));
  const sentMap = new Map<string, Set<DuelReminderKind>>();
  for (const s of sent) {
    let kinds = sentMap.get(s.duelId);
    if (!kinds) {
      kinds = new Set();
      sentMap.set(s.duelId, kinds);
    }
    kinds.add(s.kind);
  }

  const targets: DuelReminderTarget[] = [];
  for (const row of rows) {
    const ms = new Date(row.proposedGameTime).getTime() - now.getTime();
    const kind = pickKind(ms);
    if (!kind) continue;
    if (sentMap.get(row.id)?.has(kind)) continue;
    targets.push({
      duelId: row.id,
      proposingUserId: row.proposingUserId,
      opposingUserId: row.opposingUserId,
      proposedGameTime: row.proposedGameTime,
      location: row.location,
      winCondition: row.winCondition,
      kind,
    });
  }
  return targets;
}

// Wipe sent records for a duel so the next poll re-evaluates from scratch.
// Called when proposed_game_time changes — the new time may put us
// further out (or closer in) than the old one, so we want fresh reminder
// cycles.
export function clearDuelNotifications(duelId: string): void {
  db.delete(duelNotifications)
    .where(eq(duelNotifications.duelId, duelId))
    .run();
}

// Atomically mark (duelId, kind) as sent. Returns true if this call
// inserted the row, false if a concurrent poll beat us (PK collision).
export function recordSentDuel(
  duelId: string,
  kind: DuelReminderKind
): boolean {
  try {
    db.insert(duelNotifications)
      .values({ duelId, kind, sentAt: new Date().toISOString() })
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

// Human-readable lead-time phrase for the message body. Mirrors
// formatTimeUntil in src/lib/notifications.ts.
export function formatTimeUntilDuel(msUntilStart: number): string {
  const minutes = Math.round(msUntilStart / (60 * 1000));
  if (minutes <= 1) return "starting now";
  if (minutes < 60) return `starts in ${minutes} minutes`;
  const hours = Math.round(msUntilStart / (60 * 60 * 1000));
  if (hours === 1) return "starts in 1 hour";
  if (hours < 20) return `starts in ${hours} hours`;
  return "starts tomorrow";
}
