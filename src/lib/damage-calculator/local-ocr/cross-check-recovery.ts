// Algebraic recovery for a single missing trailing digit on one of the 5
// values in the cross-check equation (flagship dealt + each champion dealt
// == enemy damageReceived).
//
// Extensive testing (real screenshots, isolated tight crops, heavy upscale,
// thresholding, alternate psm/oem modes) showed the wrap-line digit glyph
// the game renders for an overflow number is small enough that Tesseract
// frequently can't read it at all — not a preprocessing problem, a real
// ceiling for this glyph size. But the cross-check equation is a redundant
// constraint: if every value is correct except one is short its last digit
// (a value V read as V instead of the true 10V+d), the deficit is exactly
// 9V+d, which is solvable for d directly — no OCR of the missing glyph
// needed. This mirrors a checksum-based single-error correction: the
// solution space is only 5 candidates x 10 digits, and requiring an EXACT
// integer equation match across up to 9-digit numbers makes an accidental
// false-positive fix astronomically unlikely.
//
// Only fires when exactly one (candidate, digit) pair balances the
// equation — multiple simultaneous missing digits (seen in practice on
// screenshots with several large wrapped numbers at once) correctly yield
// no unique solution and are left for the Claude fallback instead of
// guessing.
import type { LocalReading } from "./extract";

export type RecoveryResult = { recovered: boolean; note?: string };

export function tryRecoverMissingDigit(reading: LocalReading): RecoveryResult {
  const blueEntities = [reading.flagship, ...reading.champions];
  const blueTotal = blueEntities.reduce((sum, e) => sum + e.damageDealt, 0);
  const diff = blueTotal - reading.enemy.damageReceived;
  if (diff === 0) return { recovered: false };

  type Candidate = { label: string; value: number; apply: (next: number) => void; isBlue: boolean };
  const candidates: Candidate[] = [
    { label: "flagship", value: reading.flagship.damageDealt, apply: (v) => (reading.flagship.damageDealt = v), isBlue: true },
    ...reading.champions.map((c, i): Candidate => ({
      label: `champion[${i}]`,
      value: c.damageDealt,
      apply: (v) => (c.damageDealt = v),
      isBlue: true,
    })),
    {
      label: "enemy",
      value: reading.enemy.damageReceived,
      apply: (v) => (reading.enemy.damageReceived = v),
      isBlue: false,
    },
  ];

  const solutions: Array<{ candidate: Candidate; digit: number }> = [];
  for (const candidate of candidates) {
    // A stat that's genuinely 0 (a fresh champion who dealt no damage) isn't
    // a truncated read — appending a digit to 0 could never plausibly close
    // a multi-digit gap anyway, but skip explicitly for clarity/safety.
    if (candidate.value === 0) continue;
    const digit = candidate.isBlue ? -diff - 9 * candidate.value : diff - 9 * candidate.value;
    if (Number.isInteger(digit) && digit >= 0 && digit <= 9) {
      solutions.push({ candidate, digit });
    }
  }

  if (solutions.length !== 1) return { recovered: false };

  const { candidate, digit } = solutions[0];
  const before = candidate.value;
  const after = candidate.value * 10 + digit;
  candidate.apply(after);
  return {
    recovered: true,
    note: `Recovered missing trailing digit on ${candidate.label}: ${before} -> ${after} (cross-check now balances).`,
  };
}
