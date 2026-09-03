import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractBattleReadingLocal } from "./extract";

const execFileAsync = promisify(execFile);
const FIXTURES_DIR = join(__dirname, "__fixtures__");

async function tesseractAvailable(): Promise<boolean> {
  try {
    await execFileAsync("tesseract", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

// This entire suite depends on the `tesseract` binary being on PATH
// (Homebrew locally, apt in the Docker image). Skip rather than fail when
// it's absent, since that's an environment gap, not a code regression.
const hasTesseract = await tesseractAvailable();
const maybeDescribe = hasTesseract ? describe : describe.skip;

maybeDescribe("extractBattleReadingLocal (real fixtures)", () => {
  it("reads a fully-confident 1-champion screenshot exactly", async () => {
    const buf = await readFile(join(FIXTURES_DIR, "one-champion.png"));
    const expected = JSON.parse(
      await readFile(join(FIXTURES_DIR, "one-champion.expected.json"), "utf-8")
    );
    const result = await extractBattleReadingLocal(buf);
    expect(result.confident).toBe(true);
    expect(result.reading).toEqual({
      flagship: expected.flagship,
      champions: expected.champions,
      enemy: expected.enemy,
      stageDigit: expected.stageDigit,
    });
  });

  it("reads a fully-confident 2-champion screenshot exactly", async () => {
    const buf = await readFile(join(FIXTURES_DIR, "two-champions.png"));
    const expected = JSON.parse(
      await readFile(join(FIXTURES_DIR, "two-champions.expected.json"), "utf-8")
    );
    const result = await extractBattleReadingLocal(buf);
    expect(result.confident).toBe(true);
    expect(result.reading).toEqual({
      flagship: expected.flagship,
      champions: expected.champions,
      enemy: expected.enemy,
      stageDigit: expected.stageDigit,
    });
  });

  it("correctly flags a wrapped/merged 3-champion screenshot as unconfident (documents a known limitation)", async () => {
    const buf = await readFile(join(FIXTURES_DIR, "three-champions-wrapped.png"));
    const result = await extractBattleReadingLocal(buf);
    // This fixture's Killer Bee row has a wrapped number that Tesseract
    // merges with the adjacent column at low confidence — see the
    // fixture's .expected.json `note` for the full explanation and the
    // hand-verified ground truth. Asserting non-confidence (rather than
    // deleting the fixture) keeps this a regression test: if a future
    // local-OCR improvement makes this case pass, this assertion should be
    // the one that starts failing, prompting an update here.
    expect(result.confident).toBe(false);
    // Even unconfident, the stage digit and names should still come through.
    expect(result.reading?.stageDigit).toBe(4);
    expect(result.reading?.flagship.name).toBe("Opportunity");
  });
});
