import { describe, expect, it } from "vitest";
import { assignWordsToColumns, parseStatCell } from "./number-parse";
import type { TsvWord } from "./tesseract";

function word(text: string, left: number, width: number, opts: Partial<TsvWord> = {}): TsvWord {
  return { text, left, width, top: 0, height: 20, conf: 90, line: 0, ...opts };
}

describe("parseStatCell", () => {
  it("returns null/unconfident for an empty cell", () => {
    expect(parseStatCell([])).toEqual({ value: null, confident: false });
  });

  it("parses a single-line comma'd number", () => {
    expect(parseStatCell([word("2,016", 0, 100)])).toEqual({ value: 2016, confident: true });
  });

  it("concatenates a wrapped second line onto the first, top to bottom", () => {
    const words = [word("179,347,1", 0, 200, { line: 0 }), word("12", 0, 40, { line: 1 })];
    expect(parseStatCell(words)).toEqual({ value: 179347112, confident: true });
  });

  it("marks low tesseract confidence as unconfident even when a value parses", () => {
    const words = [word("55,180,142,016", 0, 400, { conf: 0 })];
    expect(parseStatCell(words)).toEqual({ value: 55180142016, confident: false });
  });

  it("treats more than 2 lines as unconfident (unexpected shape)", () => {
    const words = [word("1", 0, 20, { line: 0 }), word("2", 0, 20, { line: 1 }), word("3", 0, 20, { line: 2 })];
    expect(parseStatCell(words).confident).toBe(false);
  });
});

describe("assignWordsToColumns", () => {
  it("buckets words by nearest of the 3 expected column centers", () => {
    const cropWidth = 1656; // matches the real stat-row crop width used in calibration
    const words = [
      word("179,347,1", 104, 427), // center ~317, near 1/6 (~276)
      word("0", 795, 47), // center ~818, near 1/2 (828)
      word("2,016", 1190, 246), // center ~1313, near 5/6 (1380)
    ];
    const buckets = assignWordsToColumns(words, cropWidth);
    expect(buckets[0].map((w) => w.text)).toEqual(["179,347,1"]);
    expect(buckets[1].map((w) => w.text)).toEqual(["0"]);
    expect(buckets[2].map((w) => w.text)).toEqual(["2,016"]);
  });

  it("clusters by center even when a wide number overflows its nominal third", () => {
    // A 9-digit number's bounding box extends well past the 1/3 boundary,
    // but its center still lands closer to column 0's expected center.
    const cropWidth = 900;
    const words = [word("179,347,112", 10, 400)]; // center = 210, vs centers [150, 450, 750]
    const buckets = assignWordsToColumns(words, cropWidth);
    expect(buckets[0]).toHaveLength(1);
    expect(buckets[1]).toHaveLength(0);
    expect(buckets[2]).toHaveLength(0);
  });
});
