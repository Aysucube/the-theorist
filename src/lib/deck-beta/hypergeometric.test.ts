import { describe, expect, it } from "vitest";
import { chanceAtLeast, chanceExactly, hitSpread } from "./hypergeometric";

describe("hypergeometric odds", () => {
  it("matches known odds for a one-of in a 99-card library", () => {
    expect(chanceAtLeast(99, 1, 7, 1)).toBeCloseTo(7 / 99, 10);
    expect(chanceExactly(99, 1, 7, 0)).toBeCloseTo(92 / 99, 10);
  });

  it("matches exact values worked out in whole numbers: 38 lands, 99 cards, 7 seen", () => {
    expect(chanceExactly(99, 38, 7, 3)).toBeCloseTo(0.295718375, 8);
    expect(chanceExactly(99, 38, 7, 0)).toBeCloseTo(0.029305425, 8);
    expect(chanceAtLeast(99, 38, 7, 2)).toBeCloseTo(0.828962886, 8);
  });

  it("adds up to one across every outcome", () => {
    const spread = hitSpread(99, 38, 7);
    expect(spread).toHaveLength(8);
    expect(spread.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("is certain or impossible where it has to be", () => {
    expect(chanceAtLeast(99, 10, 7, 0)).toBe(1);
    expect(chanceAtLeast(99, 2, 7, 3)).toBe(0);
    expect(chanceAtLeast(99, 0, 7, 1)).toBe(0);
    expect(chanceExactly(10, 10, 7, 3)).toBe(0);
    expect(chanceAtLeast(10, 1, 50, 1)).toBeCloseTo(1, 10);
  });
});
