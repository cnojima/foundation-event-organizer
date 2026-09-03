// Pixel-geometry detection for the "Damage Stats" battle card, calibrated
// against real screenshots (see scripts/damage-calc-ocr-calibrate.mjs). The
// card layout is a fixed in-game UI: a blue (left/"our fleet") and red
// (right/"enemy") header bar, then up to 4 identically-sized rows (flagship
// + up to 3 champions on the blue side; a single enemy row on the red side).
//
// Detection works in two steps:
//   1. Locate the header bar by color — it's the only place in the card
//      where a saturated blue tone sits immediately beside a saturated red
//      tone, so it's a reliable, resolution-independent anchor.
//   2. Derive every other region (rows, stat columns, the enemy stage-digit
//      badge) as *ratios* of the detected bar's position/width, not raw
//      pixel offsets — this is what lets one set of constants generalize
//      across screenshots from different devices/resolutions, since the
//      game UI scales proportionally with screen width.
//
// All ratios below were measured against a 1290x2796 sample (see the
// fixtures) and are unverified against a second device/resolution. If a
// future device's screenshots don't match this UI closely enough for these
// ratios to land in the right place, `detectLayout` returns null and the
// caller falls back to Claude for that screenshot.

export type RGB = readonly [number, number, number];

// Sampled from src/lib/damage-calculator/local-ocr/__fixtures__/img-3459.png
export const HEADER_BLUE: RGB = [53, 118, 187];
export const HEADER_RED: RGB = [152, 56, 56];
const COLOR_TOLERANCE = 25;

// Ratios calibrated against the header bar's own width/position — see the
// module comment above.
const ROW_TOP0_RATIO = 0.0598; // row 1 (flagship/enemy) top, below the header bar
const ROW_PITCH_RATIO = 0.1885; // row-to-row spacing (confirmed exact: 208px @ bar width 1103px)
const ROW_COUNT = 4; // flagship + up to 3 champions
const STAT_SUBROW_TOP_RATIO = 0.096; // top of the numeric-stats sub-region within a row
const STAT_SUBROW_HEIGHT_RATIO = 0.09; // height tall enough for a wrapped 2nd line, short of the next row
// A stat cell's primary number line and its wrapped-overflow line (used for
// very large values) sit close enough together, straddling the colored
// progress-bar strip between them, that Tesseract's own multi-line
// segmentation unreliably finds the wrap line when both are OCR'd as one
// crop (confirmed: it's frequently missed entirely). Splitting the stat
// sub-region into two independently-OCR'd zones — primary text above the
// bar, wrap text below it, with the bar itself excluded as a buffer — is
// far more reliable. Fractions are of the stat sub-region's own height.
const STAT_PRIMARY_ZONE_END_FRACTION = 0.55;
const STAT_WRAP_ZONE_START_FRACTION = 0.75;
// Expected horizontal centers of the 3 stat columns (fist/heal/shield),
// as a fraction of one side's (blue or red) half-width. Equal thirds.
export const STAT_COLUMN_CENTER_RATIOS = [1 / 6, 1 / 2, 5 / 6] as const;
// Enemy stage-digit badge: bottom-right corner of the enemy avatar, itself
// in the top-right corner of row 1's red half.
const BADGE_RIGHT_INSET_RATIO = 0.0598;
const BADGE_TOP_RATIO = 0.0662;
const BADGE_SIZE_RATIO = 0.0453;
// Name text: top-left portion of a row, right of the avatar.
const NAME_LEFT_INSET_RATIO = 0.11;
const NAME_TOP_RATIO = 0.005;
const NAME_WIDTH_RATIO = 0.9;
const NAME_HEIGHT_RATIO = 0.05;

export type RawImage = { data: Buffer | Uint8Array; width: number; height: number; channels: number };

export type Rect = { left: number; top: number; width: number; height: number };

export type RowLayout = {
  /** Full row bounding box on the blue (left) side. */
  blueRow: Rect;
  /** Full row bounding box on the red (right) side — only meaningful for row 0 (the enemy). */
  redRow: Rect;
  blueStatRow: Rect;
  redStatRow: Rect;
  blueName: Rect;
  redName: Rect;
};

export type CardLayout = {
  barLeft: number;
  barRight: number;
  barTop: number;
  barBottom: number;
  splitX: number;
  rows: RowLayout[];
  stageBadge: Rect;
};

function pixelAt(img: RawImage, x: number, y: number): RGB {
  const idx = (y * img.width + x) * img.channels;
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2]];
}

function closeTo(c: RGB, target: RGB, tol = COLOR_TOLERANCE): boolean {
  return (
    Math.abs(c[0] - target[0]) <= tol &&
    Math.abs(c[1] - target[1]) <= tol &&
    Math.abs(c[2] - target[2]) <= tol
  );
}

/**
 * Locate the card's header bar and derive the full row/column/badge
 * geometry from it. Returns null if no header bar matching the expected
 * blue/red colors is found — the caller should treat that as "this
 * screenshot doesn't match a known layout" and fall back to Claude.
 */
export function detectLayout(img: RawImage): CardLayout | null {
  const xLeftProbe = Math.round(img.width * 0.25);
  const xRightProbe = Math.round(img.width * 0.75);

  let barTop = -1;
  let barBottom = -1;
  for (let y = 0; y < img.height; y++) {
    const isBar =
      closeTo(pixelAt(img, xLeftProbe, y), HEADER_BLUE) &&
      closeTo(pixelAt(img, xRightProbe, y), HEADER_RED);
    if (isBar) {
      if (barTop === -1) barTop = y;
      barBottom = y;
    } else if (barTop !== -1) {
      break; // bar is a single contiguous band; stop at its far edge
    }
  }
  if (barTop === -1) return null;

  const midY = Math.round((barTop + barBottom) / 2);
  let barLeft = -1;
  let barRight = -1;
  let splitX = -1;
  for (let x = 0; x < img.width; x++) {
    const c = pixelAt(img, x, midY);
    const isBlue = closeTo(c, HEADER_BLUE);
    const isRed = closeTo(c, HEADER_RED);
    if (isBlue || isRed) {
      if (barLeft === -1) barLeft = x;
      barRight = x;
    }
    if (barLeft !== -1 && splitX === -1 && isRed) splitX = x;
  }
  if (barLeft === -1 || splitX === -1) return null;

  const barWidth = barRight - barLeft;
  const blueLeft = barLeft;
  const blueRight = splitX;
  const redLeft = splitX;
  const redRight = barRight;
  const rowHeight = ROW_PITCH_RATIO * barWidth;
  const rowTop0 = barBottom + ROW_TOP0_RATIO * barWidth;

  const rows: RowLayout[] = [];
  for (let n = 0; n < ROW_COUNT; n++) {
    const top = rowTop0 + n * rowHeight;
    const blueRow: Rect = { left: blueLeft, top, width: blueRight - blueLeft, height: rowHeight };
    const redRow: Rect = { left: redLeft, top, width: redRight - redLeft, height: rowHeight };
    rows.push({
      blueRow,
      redRow,
      blueStatRow: {
        left: blueLeft,
        top: top + STAT_SUBROW_TOP_RATIO * barWidth,
        width: blueRight - blueLeft,
        height: STAT_SUBROW_HEIGHT_RATIO * barWidth,
      },
      redStatRow: {
        left: redLeft,
        top: top + STAT_SUBROW_TOP_RATIO * barWidth,
        width: redRight - redLeft,
        height: STAT_SUBROW_HEIGHT_RATIO * barWidth,
      },
      blueName: {
        left: blueLeft + NAME_LEFT_INSET_RATIO * barWidth,
        top: top + NAME_TOP_RATIO * barWidth,
        width: NAME_WIDTH_RATIO * (blueRight - blueLeft) - NAME_LEFT_INSET_RATIO * barWidth,
        height: NAME_HEIGHT_RATIO * barWidth,
      },
      redName: {
        left: redLeft,
        top: top + NAME_TOP_RATIO * barWidth,
        width: NAME_WIDTH_RATIO * (redRight - redLeft),
        height: NAME_HEIGHT_RATIO * barWidth,
      },
    });
  }

  const badgeSize = BADGE_SIZE_RATIO * barWidth;
  const stageBadge: Rect = {
    // BADGE_RIGHT_INSET_RATIO is calibrated as the distance from the card's
    // right edge to the badge's own LEFT edge (not a margin outside it).
    left: redRight - BADGE_RIGHT_INSET_RATIO * barWidth,
    top: rowTop0 + BADGE_TOP_RATIO * barWidth,
    width: badgeSize,
    height: badgeSize,
  };

  return { barLeft, barRight, barTop, barBottom, splitX, rows, stageBadge };
}

/**
 * Split a stat sub-region rect (from RowLayout.blueStatRow / redStatRow)
 * into an independently-OCR'able primary-line zone and wrap-line zone —
 * see the module comment near STAT_PRIMARY_ZONE_END_FRACTION for why.
 */
export function splitStatRow(rect: Rect): { primary: Rect; wrap: Rect } {
  return {
    primary: { ...rect, height: rect.height * STAT_PRIMARY_ZONE_END_FRACTION },
    wrap: {
      ...rect,
      top: rect.top + rect.height * STAT_WRAP_ZONE_START_FRACTION,
      height: rect.height * (1 - STAT_WRAP_ZONE_START_FRACTION),
    },
  };
}

/** Clamp a rect to the image bounds and round to integer pixels (sharp requires both). */
export function clampRect(rect: Rect, imgWidth: number, imgHeight: number): Rect {
  const left = Math.max(0, Math.min(Math.round(rect.left), imgWidth - 1));
  const top = Math.max(0, Math.min(Math.round(rect.top), imgHeight - 1));
  const width = Math.max(1, Math.min(Math.round(rect.width), imgWidth - left));
  const height = Math.max(1, Math.min(Math.round(rect.height), imgHeight - top));
  return { left, top, width, height };
}
