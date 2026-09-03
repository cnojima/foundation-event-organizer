// Orchestrates the local OCR pipeline: detect the card layout, crop each
// region, OCR it, and assemble a result shaped like the existing (Claude)
// `ExtractedReading`. Returns a confidence flag rather than throwing on a
// bad read — the caller (the readings route) decides whether to trust the
// local result or fall back to Claude.
import sharp from "sharp";
import { detectLayout, type CardLayout } from "./layout";
import { getRowNameCrop, getRowStatCrops, getStageBadgeCrop } from "./regions";
import { ocrDigitsTsv, ocrNameLine, ocrSingleDigit, TesseractUnavailableError } from "./tesseract";
import { assignWordsToColumns, parseStatCell } from "./number-parse";
import { tryRecoverMissingDigit } from "./cross-check-recovery";

export type LocalEntity = {
  name: string;
  damageDealt: number;
  healingDone: number;
  damageReceived: number;
};

export type LocalReading = {
  flagship: LocalEntity;
  champions: LocalEntity[];
  enemy: LocalEntity;
  stageDigit: 1 | 2 | 3 | 4;
};

export type LocalExtractResult =
  | { confident: true; reading: LocalReading }
  | { confident: false; reading: LocalReading | null; reason: string };

async function ocrEntity(
  source: ReturnType<typeof sharp>,
  layout: CardLayout,
  rowIndex: number,
  side: "blue" | "red",
  imgWidth: number,
  imgHeight: number,
  columnOrder: ["dealt" | "heal" | "received", "dealt" | "heal" | "received", "dealt" | "heal" | "received"]
): Promise<{ entity: LocalEntity | null; confident: boolean; empty: boolean }> {
  const { png: namePng } = await getRowNameCrop(source, layout, rowIndex, side, imgWidth, imgHeight);
  const name = await ocrNameLine(namePng);
  // An empty row (no champion in this slot) occasionally still yields a
  // short OCR noise fragment (e.g. "ne") from background/border pixels.
  // Real champion/flagship names are never this short, so treat anything
  // under 3 characters as "no entity here" rather than a real name.
  if (name.length < 3) return { entity: null, confident: false, empty: true };

  const { primaryCrop, wrapCrop } = await getRowStatCrops(source, layout, rowIndex, side, imgWidth, imgHeight);
  const [primaryWords, wrapWords] = await Promise.all([
    ocrDigitsTsv(primaryCrop.png),
    ocrDigitsTsv(wrapCrop.png),
  ]);
  // Each crop is OCR'd independently, so re-tag lines by which crop they
  // came from rather than trusting Tesseract's own (single-crop) line
  // numbering — this guarantees primary-line words sort before wrap-line
  // words regardless of what either crop's internal segmentation reported.
  const words = [
    ...primaryWords.map((w) => ({ ...w, line: 0 })),
    ...wrapWords.map((w) => ({ ...w, line: 1 })),
  ];
  const buckets = assignWordsToColumns(words, primaryCrop.cropWidth);
  const cells = buckets.map(parseStatCell);

  const byLabel: Record<"dealt" | "heal" | "received", (typeof cells)[number]> = {
    dealt: cells[columnOrder.indexOf("dealt")],
    heal: cells[columnOrder.indexOf("heal")],
    received: cells[columnOrder.indexOf("received")],
  };

  const confident = cells.every((c) => c.confident && c.value !== null);
  const entity: LocalEntity = {
    name,
    damageDealt: byLabel.dealt.value ?? 0,
    healingDone: byLabel.heal.value ?? 0,
    damageReceived: byLabel.received.value ?? 0,
  };
  return { entity, confident, empty: false };
}

export async function extractBattleReadingLocal(imageBuffer: Buffer): Promise<LocalExtractResult> {
  let source: ReturnType<typeof sharp>;
  let imgWidth: number;
  let imgHeight: number;
  let raw: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    source = sharp(imageBuffer);
    const meta = await source.metadata();
    if (!meta.width || !meta.height) {
      return { confident: false, reading: null, reason: "Could not read image dimensions." };
    }
    imgWidth = meta.width;
    imgHeight = meta.height;
    raw = await source.clone().raw().toBuffer({ resolveWithObject: true });
  } catch (err) {
    return { confident: false, reading: null, reason: `Failed to decode image: ${String(err)}` };
  }

  const layout = detectLayout({
    data: raw.data,
    width: raw.info.width,
    height: raw.info.height,
    channels: raw.info.channels,
  });
  if (!layout) {
    return { confident: false, reading: null, reason: "Header bar not found — unrecognized layout." };
  }

  try {
    const { png: badgePng } = await getStageBadgeCrop(source, layout, imgWidth, imgHeight);
    const digitText = await ocrSingleDigit(badgePng);
    const digitNum = Number.parseInt(digitText, 10);
    if (![1, 2, 3, 4].includes(digitNum)) {
      return { confident: false, reading: null, reason: `Stage badge unreadable (got "${digitText}").` };
    }
    const stageDigit = digitNum as 1 | 2 | 3 | 4;

    const BLUE_ORDER = ["dealt", "heal", "received"] as const;
    const RED_ORDER = ["received", "heal", "dealt"] as const;

    const flagshipResult = await ocrEntity(source, layout, 0, "blue", imgWidth, imgHeight, [...BLUE_ORDER]);
    if (!flagshipResult.entity) {
      return { confident: false, reading: null, reason: "Flagship name not detected." };
    }

    const champions: LocalEntity[] = [];
    let championsConfident = true;
    for (let rowIndex = 1; rowIndex <= 3; rowIndex++) {
      const result = await ocrEntity(source, layout, rowIndex, "blue", imgWidth, imgHeight, [...BLUE_ORDER]);
      if (result.empty) continue; // no more champions in this screenshot
      if (result.entity) champions.push(result.entity);
      if (!result.confident) championsConfident = false;
    }

    const enemyResult = await ocrEntity(source, layout, 0, "red", imgWidth, imgHeight, [...RED_ORDER]);
    if (!enemyResult.entity) {
      return { confident: false, reading: null, reason: "Enemy name not detected." };
    }

    const reading: LocalReading = {
      flagship: flagshipResult.entity,
      champions,
      enemy: enemyResult.entity,
      stageDigit,
    };

    const blueDealtTotal = () =>
      [reading.flagship, ...reading.champions].reduce((sum, e) => sum + e.damageDealt, 0);
    let crossCheckPasses = blueDealtTotal() === reading.enemy.damageReceived;
    const perCellConfident = flagshipResult.confident && championsConfident && enemyResult.confident;

    // Every individual cell read cleanly on its own but the totals don't
    // balance — the classic signature of one value missing an undetected
    // wrap digit. Try to solve for it algebraically before giving up on
    // this screenshot. See cross-check-recovery.ts for why this is safe.
    if (!crossCheckPasses && perCellConfident) {
      const recovery = tryRecoverMissingDigit(reading);
      if (recovery.recovered) {
        crossCheckPasses = true;
        console.log(`[damage-calculator local-ocr] ${recovery.note}`);
      }
    }

    const confident = perCellConfident && crossCheckPasses;

    if (!confident) {
      const reason = !crossCheckPasses
        ? `Cross-check failed: blue dealt total ${blueDealtTotal()} != enemy received ${reading.enemy.damageReceived}.`
        : "One or more stat cells were low-confidence.";
      return { confident: false, reading, reason };
    }

    return { confident: true, reading };
  } catch (err) {
    if (err instanceof TesseractUnavailableError) throw err;
    return { confident: false, reading: null, reason: `Unexpected local OCR error: ${String(err)}` };
  }
}
