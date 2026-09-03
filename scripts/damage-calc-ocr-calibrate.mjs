#!/usr/bin/env node
// Dev-only tool for tuning the local OCR layout ratios in
// src/lib/damage-calculator/local-ocr/layout.ts. Not part of the deployed
// app — run it directly against a real screenshot when a new device's
// layout doesn't match the calibrated ratios, to see exactly where the
// detector's row/column/badge boxes land so you can adjust the ratio
// constants.
//
// Usage:
//   node scripts/damage-calc-ocr-calibrate.mjs <screenshot.png> [out.png]
//
// Writes an annotated copy of the input image (green = detected header bar,
// yellow = blue/red split line, magenta = row boxes, cyan = stage badge) to
// `out.png` (default: <input>.calibrated.png next to the input).
import sharp from "sharp";
import { detectLayout } from "../src/lib/damage-calculator/local-ocr/layout.ts";

const [, , inputPath, outputPathArg] = process.argv;
if (!inputPath) {
  console.error("Usage: node scripts/damage-calc-ocr-calibrate.mjs <screenshot.png> [out.png]");
  process.exit(1);
}
const outputPath = outputPathArg ?? inputPath.replace(/(\.[^.]+)$/, ".calibrated.png");

const source = sharp(inputPath);
const meta = await source.metadata();
const { data, info } = await source.clone().raw().toBuffer({ resolveWithObject: true });
const layout = detectLayout({ data, width: info.width, height: info.height, channels: info.channels });

if (!layout) {
  console.error("No header bar detected — this image doesn't match the calibrated layout at all.");
  process.exit(1);
}

console.log(JSON.stringify(layout, null, 2));

const rects = layout.rows
  .flatMap((row) => [row.blueRow, row.redRow, row.blueStatRow, row.redStatRow, row.blueName, row.redName])
  .map(
    (r) =>
      `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" fill="none" stroke="magenta" stroke-width="2"/>`
  )
  .join("\n");

const svg = `<svg width="${meta.width}" height="${meta.height}">
  <rect x="${layout.barLeft}" y="${layout.barTop}" width="${layout.barRight - layout.barLeft}" height="${layout.barBottom - layout.barTop}" fill="none" stroke="lime" stroke-width="4"/>
  <line x1="${layout.splitX}" y1="${layout.barTop}" x2="${layout.splitX}" y2="${meta.height}" stroke="yellow" stroke-width="2"/>
  <rect x="${layout.stageBadge.left}" y="${layout.stageBadge.top}" width="${layout.stageBadge.width}" height="${layout.stageBadge.height}" fill="none" stroke="cyan" stroke-width="3"/>
  ${rects}
</svg>`;

await source.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).toFile(outputPath);
console.log("Wrote", outputPath);
