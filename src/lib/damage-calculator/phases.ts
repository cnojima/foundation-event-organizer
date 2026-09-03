// Fixed, repeating phase list for the "Calamity Befalls" raid. Order here is
// both the DB enum and the display column order (latest phase first, same as
// the source spreadsheet). Folder names in an uploaded screenshot directory
// are matched against these values case-insensitively — the in-game battle
// card itself carries no phase indicator, so this is the only source of
// truth for which phase a screenshot belongs to.
export const PHASES = [
  "IV",
  "III.iii",
  "III.ii",
  "III.i",
  "II.iii",
  "II.ii",
  "II.i",
  "I.iii",
  "I.ii",
  "I.i",
] as const;

export type Phase = (typeof PHASES)[number];

const PHASE_LOOKUP = new Map(PHASES.map((p) => [p.toLowerCase(), p]));

export function matchPhase(folderName: string): Phase | null {
  return PHASE_LOOKUP.get(folderName.trim().toLowerCase()) ?? null;
}

export type StageDigit = 1 | 2 | 3 | 4;

const DIGIT_TO_MAJOR: Record<StageDigit, "I" | "II" | "III" | "IV"> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
};

// The enemy-portrait badge only carries the major stage number, never the
// sub-stage — so a digit of 1-3 resolves to a candidate list of 3 possible
// phases, in chronological (in-game) order. Digit 4 has no sub-stage and
// resolves unambiguously.
export function subPhasesForDigit(digit: StageDigit): Phase[] {
  const major = DIGIT_TO_MAJOR[digit];
  if (major === "IV") return ["IV"];
  return [`${major}.i`, `${major}.ii`, `${major}.iii`] as Phase[];
}
