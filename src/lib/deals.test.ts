import { describe, expect, it } from "vitest";
import { findDeal } from "./deals";
import type { PriceResponse } from "./types";

const rate = { rate: 60, date: "2026-10-23", source: "European Central Bank" } as const;
const copy = (pricePhp: number) => ({ pricePhp, store: "Vault", condition: "NM", url: "https://tcg.ph/x" });
const prices = (bySet: Record<string, ReturnType<typeof copy>>): PriceResponse => ({
  found: true,
  url: "https://tcg.ph/c",
  cheapest: copy(10),
  stores: 1,
  listings: 1,
  byStore: [],
  bySet,
});

describe("findDeal", () => {
  // Market price $10 = ₱600, so a deal is ₱480 or less.
  const card = { setCode: "ptk", toUsd: 10 };

  it("counts a copy of the same printing at least 20% under market", () => {
    expect(findDeal(card, prices({ PTK: copy(480) }), rate)).toMatchObject({ marketPhp: 600, savings: 0.2 });
    expect(findDeal(card, prices({ PTK: copy(300) }), rate)?.savings).toBeCloseTo(0.5);
  });

  it("doesn't count a copy less than 20% under market", () => {
    expect(findDeal(card, prices({ PTK: copy(481) }), rate)).toBeNull();
    expect(findDeal(card, prices({ PTK: copy(700) }), rate)).toBeNull();
  });

  it("doesn't count a cheaper reprint from another set", () => {
    expect(findDeal(card, prices({ C21: copy(50) }), rate)).toBeNull();
  });

  it("needs an exchange rate, a set and a price", () => {
    expect(findDeal(card, prices({ PTK: copy(100) }), null)).toBeNull();
    expect(findDeal({ toUsd: 10 }, prices({ PTK: copy(100) }), rate)).toBeNull();
    expect(findDeal(card, { found: false }, rate)).toBeNull();
    expect(findDeal(card, "error", rate)).toBeNull();
    expect(findDeal(card, undefined, rate)).toBeNull();
  });
});
