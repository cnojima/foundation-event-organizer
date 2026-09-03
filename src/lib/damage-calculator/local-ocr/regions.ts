// Crops the regions computed by layout.ts out of the source image, as PNG
// buffers ready for OCR. Upscales every crop — the source screenshot's UI
// text renders small relative to the full image, and Tesseract reads
// upscaled text noticeably more reliably (verified during calibration).
import sharp from "sharp";
import { clampRect, splitStatRow, type CardLayout, type Rect } from "./layout";

const UPSCALE = 3;

export async function cropRegion(
  source: ReturnType<typeof sharp>,
  rect: Rect,
  imgWidth: number,
  imgHeight: number
): Promise<{ png: Buffer; cropWidth: number }> {
  const clamped = clampRect(rect, imgWidth, imgHeight);
  const png = await source
    .clone()
    .extract(clamped)
    .resize({ width: clamped.width * UPSCALE })
    .png()
    .toBuffer();
  return { png, cropWidth: clamped.width * UPSCALE };
}

export type Side = "blue" | "red";

export async function getRowNameCrop(
  source: ReturnType<typeof sharp>,
  layout: CardLayout,
  rowIndex: number,
  side: Side,
  imgWidth: number,
  imgHeight: number
) {
  const row = layout.rows[rowIndex];
  const rect = side === "blue" ? row.blueName : row.redName;
  return cropRegion(source, rect, imgWidth, imgHeight);
}

/**
 * Crops a row's stat sub-region as two independent images — the primary
 * number line and the wrapped-overflow line below it — rather than one tall
 * crop. See splitStatRow's doc comment for why: Tesseract's own multi-line
 * segmentation unreliably finds the wrap line when both are OCR'd together.
 */
export async function getRowStatCrops(
  source: ReturnType<typeof sharp>,
  layout: CardLayout,
  rowIndex: number,
  side: Side,
  imgWidth: number,
  imgHeight: number
) {
  const row = layout.rows[rowIndex];
  const rect = side === "blue" ? row.blueStatRow : row.redStatRow;
  const { primary, wrap } = splitStatRow(rect);
  const [primaryCrop, wrapCrop] = await Promise.all([
    cropRegion(source, primary, imgWidth, imgHeight),
    cropRegion(source, wrap, imgWidth, imgHeight),
  ]);
  return { primaryCrop, wrapCrop };
}

export async function getStageBadgeCrop(
  source: ReturnType<typeof sharp>,
  layout: CardLayout,
  imgWidth: number,
  imgHeight: number
) {
  return cropRegion(source, layout.stageBadge, imgWidth, imgHeight);
}
