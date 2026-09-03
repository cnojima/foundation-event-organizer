import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { detectLayout } from "./layout";

const FIXTURES_DIR = join(__dirname, "__fixtures__");

async function loadRaw(fixtureName: string) {
  const buf = await readFile(join(FIXTURES_DIR, fixtureName));
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

// All 3 fixtures were cropped from the same device's screenshots with an
// identical (left: 30, top: 590) offset, so the header bar lands at the
// same position (within a few px of anti-aliasing/measurement noise) in
// every one of them.
const EXPECTED = { barTop: 171, barBottom: 206, barLeft: 63, barRight: 1166, splitX: 615 };
const TOLERANCE = 5;

describe.each(["one-champion.png", "two-champions.png", "three-champions-wrapped.png"])(
  "detectLayout(%s)",
  (fixtureName) => {
    it("locates the header bar within the expected pixel range", async () => {
      const img = await loadRaw(fixtureName);
      const layout = detectLayout(img);
      expect(layout).not.toBeNull();
      expect(layout!.barTop).toBeGreaterThanOrEqual(EXPECTED.barTop - TOLERANCE);
      expect(layout!.barTop).toBeLessThanOrEqual(EXPECTED.barTop + TOLERANCE);
      expect(layout!.barBottom).toBeGreaterThanOrEqual(EXPECTED.barBottom - TOLERANCE);
      expect(layout!.barLeft).toBeGreaterThanOrEqual(EXPECTED.barLeft - TOLERANCE);
      expect(layout!.barRight).toBeLessThanOrEqual(EXPECTED.barRight + TOLERANCE);
      expect(layout!.splitX).toBeGreaterThanOrEqual(EXPECTED.splitX - TOLERANCE);
      expect(layout!.splitX).toBeLessThanOrEqual(EXPECTED.splitX + TOLERANCE);
    });

    it("produces 4 evenly-pitched rows", async () => {
      const img = await loadRaw(fixtureName);
      const layout = detectLayout(img)!;
      expect(layout.rows).toHaveLength(4);
      const pitch0 = layout.rows[1].blueRow.top - layout.rows[0].blueRow.top;
      const pitch1 = layout.rows[2].blueRow.top - layout.rows[1].blueRow.top;
      const pitch2 = layout.rows[3].blueRow.top - layout.rows[2].blueRow.top;
      expect(pitch1).toBeCloseTo(pitch0, 0);
      expect(pitch2).toBeCloseTo(pitch0, 0);
    });

    it("places the stage badge inside the enemy (red) row 0", async () => {
      const img = await loadRaw(fixtureName);
      const layout = detectLayout(img)!;
      const enemyRow = layout.rows[0].redRow;
      expect(layout.stageBadge.left).toBeGreaterThanOrEqual(enemyRow.left);
      expect(layout.stageBadge.left + layout.stageBadge.width).toBeLessThanOrEqual(enemyRow.left + enemyRow.width + 1);
      expect(layout.stageBadge.top).toBeGreaterThanOrEqual(enemyRow.top);
    });
  }
);

describe("detectLayout on a non-matching image", () => {
  it("returns null instead of guessing", () => {
    const blank = {
      data: Buffer.alloc(200 * 200 * 3, 255),
      width: 200,
      height: 200,
      channels: 3,
    };
    expect(detectLayout(blank)).toBeNull();
  });
});
