// Helpers for surfacing per-squad start times in UI listings.

import type { events } from "@/db/schema";

type EventLike = Pick<
  typeof events.$inferSelect,
  "kind" | "gameTime" | "squad1Name" | "squad2Name" | "squad1StartsAt" | "squad2StartsAt"
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
