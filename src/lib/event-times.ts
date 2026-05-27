// Helpers for surfacing per-squad start times in UI listings.

import type { events } from "@/db/schema";

type EventLike = Pick<
  typeof events.$inferSelect,
  "kind" | "gameTime" | "durationMinutes" | "squad1Name" | "squad2Name" | "squad1StartsAt" | "squad2StartsAt"
>;

// Returns the earliest known start timestamp across simple/match/scrim modes,
// or null if nothing is scheduled. Used for "is the event upcoming?" sorting.
export function effectiveStartIso(event: EventLike): string | null {
  if (event.kind === "simple" || event.kind === "scrim") {
    return event.gameTime ?? event.squad1StartsAt ?? null;
  }
  const candidates = [event.squad1StartsAt, event.squad2StartsAt].filter(
    (v): v is string => !!v
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a < b ? a : b));
}

// Fallback padding when no duration is set. Long enough that a 2-3h game
// session + post-game roster review still counts as "current."
const EVENT_DURATION_FALLBACK_MS = 6 * 60 * 60 * 1000;

// Latest scheduled time + duration (or fallback), or null if nothing is
// scheduled (those events are treated as upcoming — still being planned).
export function effectiveEndIso(event: EventLike): string | null {
  let latest: string | null = null;
  if (event.kind === "simple" || event.kind === "scrim") {
    latest = event.gameTime ?? event.squad1StartsAt ?? null;
  } else {
    const candidates = [event.squad1StartsAt, event.squad2StartsAt].filter(
      (v): v is string => !!v
    );
    if (candidates.length > 0) {
      latest = candidates.reduce((a, b) => (a > b ? a : b));
    }
  }
  if (!latest) return null;
  const durationMs = event.durationMinutes
    ? event.durationMinutes * 60_000
    : EVENT_DURATION_FALLBACK_MS;
  return new Date(new Date(latest).getTime() + durationMs).toISOString();
}

// Has this event's scheduled window (+ padding) already passed?
// Events with nothing scheduled return false — they're still upcoming.
export function isEventPast(event: EventLike, now = new Date()): boolean {
  const endIso = effectiveEndIso(event);
  if (!endIso) return false;
  return new Date(endIso).getTime() <= now.getTime();
}

export type SquadTimeEntry = { name: string; startsAt: string | null };

// For match events, returns both squads with their (possibly null) start
// times so the UI can render "Alpha: …" and "Bravo: TBD" consistently.
// Scrim events have a single roster, so we return just that one.
export function squadTimes(event: EventLike): SquadTimeEntry[] {
  if (event.kind === "match") {
    return [
      { name: event.squad1Name, startsAt: event.squad1StartsAt },
      { name: event.squad2Name, startsAt: event.squad2StartsAt },
    ];
  }
  if (event.kind === "scrim") {
    return [{ name: event.squad1Name, startsAt: event.squad1StartsAt ?? event.gameTime }];
  }
  return [];
}
