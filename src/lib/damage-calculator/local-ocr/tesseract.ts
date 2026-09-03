// Thin wrapper around the `tesseract` CLI binary (installed via apt in the
// Dockerfile's final stage; `brew install tesseract` for local dev). We shell
// out per crop rather than using a wrapper library — it's a one-shot,
// file-in/text-out call with no long-lived process to manage.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export class TesseractUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The `tesseract` binary is not available on this machine.");
    this.cause = cause;
  }
}

export type TsvWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  conf: number;
  line: number;
};

async function withTempPng(png: Buffer, fn: (path: string) => Promise<string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "damage-calc-ocr-"));
  const path = join(dir, "crop.png");
  try {
    await writeFile(path, png);
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runTesseract(png: Buffer, args: string[]): Promise<string> {
  return withTempPng(png, async (path) => {
    try {
      const { stdout } = await execFileAsync("tesseract", [path, "stdout", ...args]);
      return stdout;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") throw new TesseractUnavailableError(err);
      throw err;
    }
  });
}

/**
 * OCR a crop expected to contain a small block of digits/commas, possibly
 * spanning multiple lines (the game UI wraps very large numbers onto a
 * reserved second line). Returns word-level bounding boxes so the caller
 * can cluster words by column position rather than relying on exact crop
 * boundaries.
 */
export async function ocrDigitsTsv(png: Buffer): Promise<TsvWord[]> {
  const tsv = await runTesseract(png, [
    "--psm",
    "6",
    "-c",
    "tessedit_char_whitelist=0123456789,",
    "tsv",
  ]);
  return parseTsv(tsv);
}

// A whitelist restricted to "1234" makes Tesseract return nothing at all
// when it initially classifies the glyph as a look-alike letter (a plain
// "1" is frequently read as "i"/"l"/"I" at this size) rather than falling
// back to the nearest allowed digit. Recognizing more broadly and then
// normalizing known look-alikes to "1" is more reliable in practice.
const DIGIT_LOOKALIKES: Record<string, string> = { i: "1", I: "1", l: "1", L: "1", "|": "1" };

/** OCR a crop expected to contain exactly one digit (the stage badge). */
export async function ocrSingleDigit(png: Buffer, allowed = "1234"): Promise<string> {
  const text = await runTesseract(png, ["--psm", "10"]);
  const normalized = [...text.trim()].map((ch) => DIGIT_LOOKALIKES[ch] ?? ch).join("");
  const match = [...normalized].find((ch) => allowed.includes(ch));
  return match ?? "";
}

// Champion/flagship names are always letters (incl. accented), spaces,
// apostrophes, or hyphens — never digits or symbols. A sliver of the avatar
// image bleeding into the name crop occasionally produces stray junk
// characters; stripping anything outside that set is cheap and robust
// against that, rather than chasing pixel-perfect crop boundaries.
const NAME_CHAR_PATTERN = /[^\p{L}\s'-]/gu;

/** OCR a crop expected to contain a single line of name text. */
export async function ocrNameLine(png: Buffer): Promise<string> {
  const text = await runTesseract(png, ["--psm", "7"]);
  return text.replace(NAME_CHAR_PATTERN, "").replace(/\s+/g, " ").trim();
}

function parseTsv(tsv: string): TsvWord[] {
  const lines = tsv.split("\n").slice(1); // drop header row
  const words: TsvWord[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    const [level, , , , lineNum, , left, top, width, height, conf, ...textParts] = cols;
    if (level !== "5") continue; // word-level rows only
    const text = textParts.join("\t").trim();
    if (!text) continue;
    words.push({
      text,
      left: Number(left),
      top: Number(top),
      width: Number(width),
      height: Number(height),
      conf: Number(conf),
      line: Number(lineNum),
    });
  }
  return words;
}
