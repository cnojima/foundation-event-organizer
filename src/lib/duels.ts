// Helpers for 1v1 duel proposals — mirrors src/lib/scrims.ts but typed
// around proposing/opposing USERS rather than guilds.

// Same canonical map list as scrims. Admins can also enter free-text custom
// locations, so this is just the dropdown source.
export const DEFAULT_DUEL_LOCATIONS = [
  "Kruger",
  "Cerno",
  "Kanvo",
  "Sphinx",
] as const;

export type DuelResult =
  | "proposing_won"
  | "opposing_won"
  | "draw"
  | "no_contest";

export type DuelSide = "proposing" | "opposing";

export type ViewerOutcome = "W" | "L" | "D" | "NC";

// Translates the perspective-free `result` enum into the viewer's W/L/D/NC.
// Used wherever we render a duel chip from a particular user's side.
export function viewerOutcome(
  side: DuelSide,
  result: DuelResult | null | undefined
): ViewerOutcome | null {
  if (!result) return null;
  if (result === "draw") return "D";
  if (result === "no_contest") return "NC";
  if (result === "proposing_won") return side === "proposing" ? "W" : "L";
  return side === "proposing" ? "L" : "W";
}

// Given a viewer + the proposing/opposing user IDs, returns which side the
// viewer is on. Falls back to "proposing" if neither matches (super-admin
// viewing a duel they weren't part of — the result enum is absolute, so the
// display still makes sense from that fallback).
export function duelSideFor(
  viewerUserId: string | null,
  proposingUserId: string,
  opposingUserId: string
): DuelSide {
  if (viewerUserId === opposingUserId) return "opposing";
  if (viewerUserId === proposingUserId) return "proposing";
  return "proposing";
}

// Converts a viewer-relative outcome ("won" / "lost") to the absolute result
// stored in the DB. "draw" and "no_contest" are perspective-free.
export function outcomeToAbsoluteResult(
  side: DuelSide,
  outcome: "won" | "lost" | "draw" | "no_contest"
): DuelResult {
  if (outcome === "draw") return "draw";
  if (outcome === "no_contest") return "no_contest";
  if (outcome === "won") {
    return side === "proposing" ? "proposing_won" : "opposing_won";
  }
  return side === "proposing" ? "opposing_won" : "proposing_won";
}

// ELO rating math. K=24 is a middle-of-the-road choice — small enough to
// avoid wild swings for high-volume players, large enough that the rating
// moves visibly per duel for casual users. No-contest results don't touch
// ratings (handled by the caller, not here).
export const ELO_K_FACTOR = 24;

function expectedScore(myRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
}

// Returns the rating CHANGE (positive or negative integer) for a player
// with `myRating` who scored `actualScore` (1 = win, 0.5 = draw, 0 = loss)
// against an opponent rated `opponentRating`. Rounded to integer because
// fractional ratings are noise.
export function computeRatingDelta(
  myRating: number,
  opponentRating: number,
  actualScore: 1 | 0.5 | 0
): number {
  const expected = expectedScore(myRating, opponentRating);
  return Math.round(ELO_K_FACTOR * (actualScore - expected));
}

// Given an absolute result and the two players' current ratings, returns
// the rating change for each side. `no_contest` returns zero for both
// (caller may skip the update entirely).
export function computeRatingChanges(
  result: DuelResult,
  proposingRating: number,
  opposingRating: number
): { proposing: number; opposing: number } {
  if (result === "no_contest") return { proposing: 0, opposing: 0 };
  const proposingScore: 1 | 0.5 | 0 =
    result === "proposing_won" ? 1 : result === "draw" ? 0.5 : 0;
  // SQLite stores `0.5` fine, but TypeScript wants the discriminated type.
  const opposingScore: 1 | 0.5 | 0 =
    result === "opposing_won" ? 1 : result === "draw" ? 0.5 : 0;
  return {
    proposing: computeRatingDelta(
      proposingRating,
      opposingRating,
      proposingScore
    ),
    opposing: computeRatingDelta(
      opposingRating,
      proposingRating,
      opposingScore
    ),
  };
}
