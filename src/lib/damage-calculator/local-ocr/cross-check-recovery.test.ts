import { describe, expect, it } from "vitest";
import { tryRecoverMissingDigit } from "./cross-check-recovery";
import type { LocalReading } from "./extract";

function makeReading(overrides: Partial<LocalReading> = {}): LocalReading {
  return {
    flagship: { name: "Gram", damageDealt: 642096, healingDone: 355, damageReceived: 355 },
    champions: [{ name: "Lily", damageDealt: 4821879, healingDone: 0, damageReceived: 0 }],
    enemy: { name: "Calamity Befalls", damageDealt: 355, healingDone: 0, damageReceived: 5463975 },
    stageDigit: 1,
    ...overrides,
  };
}

describe("tryRecoverMissingDigit", () => {
  it("does nothing when the cross-check already balances", () => {
    const reading = makeReading();
    const result = tryRecoverMissingDigit(reading);
    expect(result.recovered).toBe(false);
    expect(reading.enemy.damageReceived).toBe(5463975);
  });

  it("recovers a single missing trailing digit on the enemy side", () => {
    // True value is 5,463,975 but the wrap digit "5" wasn't OCR'd.
    const reading = makeReading({
      enemy: { name: "Calamity Befalls", damageDealt: 355, healingDone: 0, damageReceived: 546397 },
    });
    const result = tryRecoverMissingDigit(reading);
    expect(result.recovered).toBe(true);
    expect(reading.enemy.damageReceived).toBe(5463975);
  });

  it("recovers a single missing trailing digit on a blue-side entity", () => {
    // Champion's true dealt is 4,821,879 but was read as 482187 (missing "9").
    const reading = makeReading({
      champions: [{ name: "Lily", damageDealt: 482187, healingDone: 0, damageReceived: 0 }],
    });
    const result = tryRecoverMissingDigit(reading);
    expect(result.recovered).toBe(true);
    expect(reading.champions[0].damageDealt).toBe(4821879);
  });

  it("refuses to guess when the deficit doesn't correspond to a single missing digit", () => {
    // Missing two digits, not one — no (candidate, digit) pair can fix this.
    const reading = makeReading({
      enemy: { name: "Calamity Befalls", damageDealt: 355, healingDone: 0, damageReceived: 54639 },
    });
    const result = tryRecoverMissingDigit(reading);
    expect(result.recovered).toBe(false);
    expect(reading.enemy.damageReceived).toBe(54639);
  });

  it("refuses to guess when multiple candidates could each explain the deficit", () => {
    // Constructed so both the flagship (v=1 -> d=9) and the champion
    // (v=2 -> d=0) independently balance the same diff=-18 equation.
    // Ambiguous — must not pick one arbitrarily.
    const reading = makeReading({
      flagship: { name: "A", damageDealt: 1, healingDone: 0, damageReceived: 0 },
      champions: [{ name: "B", damageDealt: 2, healingDone: 0, damageReceived: 0 }],
      enemy: { name: "Calamity Befalls", damageDealt: 0, healingDone: 0, damageReceived: 21 },
    });
    const result = tryRecoverMissingDigit(reading);
    expect(result.recovered).toBe(false);
    expect(reading.flagship.damageDealt).toBe(1);
    expect(reading.champions[0].damageDealt).toBe(2);
  });

  it("skips a zero-valued candidate rather than treating it as truncated", () => {
    // Flagship legitimately dealt 0 (didn't fire); only the champion's
    // digit is actually missing. Recovery must target the champion, not 0.
    const reading = makeReading({
      flagship: { name: "Gram", damageDealt: 0, healingDone: 0, damageReceived: 0 },
      champions: [{ name: "Lily", damageDealt: 546397, healingDone: 0, damageReceived: 0 }],
      enemy: { name: "Calamity Befalls", damageDealt: 0, healingDone: 0, damageReceived: 5463975 },
    });
    const result = tryRecoverMissingDigit(reading);
    expect(result.recovered).toBe(true);
    expect(reading.flagship.damageDealt).toBe(0);
    expect(reading.champions[0].damageDealt).toBe(5463975);
  });
});
