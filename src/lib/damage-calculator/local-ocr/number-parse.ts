// Deterministic replacement for the LLM's "concatenate wrapped digits"
// instruction: when a stat value is too wide for its column, the game UI
// wraps the remainder onto a second line directly below (e.g. "179,347,1"
// with "12" underneath is really 179,347,112). Tesseract reports each line
// as a separate `line` number within a TSV block, so reassembly is just:
// take the words assigned to a stat column, group by line, strip commas,
// concatenate the raw digit strings top-to-bottom, and parse.
import { STAT_COLUMN_CENTER_RATIOS } from "./layout";
import type { TsvWord } from "./tesseract";

const MIN_WORD_CONFIDENCE = 40; // tesseract's 0-100 conf score
// A single stat value (even a wide 9-digit primary number) never spans
// close to a whole row's width. A word this wide is a bad Tesseract
// bounding box — usually a low-confidence glyph whose reported box balloons
// out to include noise (bar-chart pixels, adjacent column bleed) — and its
// `left`/`width` can't be trusted for column-clustering by center. Better
// to drop it (treated as "not found" for its cell) than risk it landing in
// the wrong column and silently corrupting an unrelated stat.
const MAX_PLAUSIBLE_WORD_WIDTH_FRACTION = 0.45;

export type StatCellResult = {
  value: number | null;
  /** False if OCR found nothing, or found something we don't trust. */
  confident: boolean;
};

/**
 * Bucket OCR'd words into the 3 known stat columns (fist/heal/shield) by
 * nearest expected center — robust to a wide number visually overflowing
 * its column's nominal width, since we cluster by each word's own center,
 * not by a hard boundary.
 */
export function assignWordsToColumns(words: TsvWord[], cropWidth: number): TsvWord[][] {
  const centers = STAT_COLUMN_CENTER_RATIOS.map((r) => r * cropWidth);
  const maxWidth = cropWidth * MAX_PLAUSIBLE_WORD_WIDTH_FRACTION;
  const buckets: TsvWord[][] = [[], [], []];
  for (const word of words) {
    if (word.width > maxWidth) continue;
    const wordCenter = word.left + word.width / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const dist = Math.abs(wordCenter - centers[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    buckets[bestIdx].push(word);
  }
  return buckets;
}

export function parseStatCell(words: TsvWord[]): StatCellResult {
  if (words.length === 0) return { value: null, confident: false };

  const lineNumbers = [...new Set(words.map((w) => w.line))].sort((a, b) => a - b);
  let digits = "";
  let lowConfidence = false;
  for (const lineNum of lineNumbers) {
    const lineWords = words
      .filter((w) => w.line === lineNum)
      .sort((a, b) => a.left - b.left);
    for (const w of lineWords) {
      if (w.conf < MIN_WORD_CONFIDENCE) lowConfidence = true;
      digits += w.text.replace(/[^0-9]/g, "");
    }
  }
  if (!digits) return { value: null, confident: false };

  return { value: Number.parseInt(digits, 10), confident: !lowConfidence && lineNumbers.length <= 2 };
}
