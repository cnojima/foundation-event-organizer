// Shared helpers for scrim proposals / events.

export const DEFAULT_SCRIM_LOCATIONS = [
  "Kruger",
  "Cerno",
  "Kanvo",
  "Sphinx",
] as const;

export type ScrimResult =
  | "proposing_won"
  | "opposing_won"
  | "draw"
  | "no_contest";

export type ScrimSide = "proposing" | "opposing";

export type ViewerOutcome = "W" | "L" | "D" | "NC";

// Translates the perspective-free `result` enum into the viewer's W/L/D/NC.
// Used wherever we render a scrim chip from a particular guild's side.
export function viewerOutcome(
  side: ScrimSide,
  result: ScrimResult | null | undefined
): ViewerOutcome | null {
  if (!result) return null;
  if (result === "draw") return "D";
  if (result === "no_contest") return "NC";
  if (result === "proposing_won") return side === "proposing" ? "W" : "L";
  return side === "proposing" ? "L" : "W";
}

// Given the viewer's guild + the proposing/opposing guild IDs, returns which
// "side" of the scrim the viewer is on. Falls back to "proposing" if neither
// matches (super-admin viewing from a third guild — results display still
// works because the result enum is absolute).
export function scrimSideFor(
  viewerGuildId: string | null,
  proposingGuildId: string,
  opposingGuildId: string
): ScrimSide {
  if (viewerGuildId === opposingGuildId) return "opposing";
  if (viewerGuildId === proposingGuildId) return "proposing";
  return "proposing";
}

// Converts a viewer-relative outcome ("won" / "lost") to the absolute result.
// "draw" and "no_contest" are perspective-free.
export function outcomeToAbsoluteResult(
  side: ScrimSide,
  outcome: "won" | "lost" | "draw" | "no_contest"
): ScrimResult {
  if (outcome === "draw") return "draw";
  if (outcome === "no_contest") return "no_contest";
  if (outcome === "won") {
    return side === "proposing" ? "proposing_won" : "opposing_won";
  }
  return side === "proposing" ? "opposing_won" : "proposing_won";
}
