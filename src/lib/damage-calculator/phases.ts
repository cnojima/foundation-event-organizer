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
