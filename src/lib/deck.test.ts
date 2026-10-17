import { describe, expect, it } from "vitest";
import {
  addCard,
  importCards,
  MAX_DECK_CARDS,
  parseDeckList,
  priceDeck,
  removeCard,
  type DeckCard,
} from "./deck";
import type { PriceResponse } from "./types";

describe("parseDeckList", () => {
  it("reads the formats deck sites export", () => {
    const text = [
      "Sol Ring",
      "1 Arcane Signet",
      "1x Command Tower",
      "1 Fire // Ice (MH2) 290",
      "1 Smothering Tithe (RNA) 22 *F*",
      "1x Rhystic Study (pcy) 45 [Draw] ^Have,#37d67a^",
      "10 Island",
    ].join("\n");

    expect(parseDeckList(text)).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Arcane Signet", qty: 1 },
      { name: "Command Tower", qty: 1 },
      { name: "Fire // Ice", qty: 1 },
      { name: "Smothering Tithe", qty: 1 },
      { name: "Rhystic Study", qty: 1 },
      { name: "Island", qty: 10 },
    ]);
  });

  it("skips blank lines, comments and section headers", () => {
    const text = "Commander\n1 Atraxa, Praetors' Voice\n\n// Ramp\nCreatures (25)\nSideboard:\n# note\n1 Sol Ring";
    expect(parseDeckList(text).map((c) => c.name)).toEqual(["Atraxa, Praetors' Voice", "Sol Ring"]);
  });

  it("adds up repeated cards, ignoring case", () => {
    expect(parseDeckList("4 Forest\n2 forest")).toEqual([{ name: "Forest", qty: 6 }]);
  });

  it("keeps parentheses that are part of a card name", () => {
    expect(parseDeckList("1 B.F.M. (Big Furry Monster)")).toEqual([
      { name: "B.F.M. (Big Furry Monster)", qty: 1 },
    ]);
  });
});

describe("deck edits", () => {
  const deck: DeckCard[] = [{ name: "Sol Ring", qty: 1 }];

  it("adds a card once", () => {
    expect(addCard(deck, "Arcane Signet")).toHaveLength(2);
    expect(addCard(deck, "sol ring")).toBe(deck);
  });

  it("stops adding at the deck size limit", () => {
    const full = Array.from({ length: MAX_DECK_CARDS }, (_, i) => ({ name: `Card ${i}`, qty: 1 }));
    expect(addCard(full, "One More")).toBe(full);
  });

  it("removes a card by name, ignoring case", () => {
    expect(removeCard(deck, "SOL RING")).toEqual([]);
  });

  it("imports pasted cards, taking the pasted quantity for cards already in the deck", () => {
    const withIslands = [...deck, { name: "Island", qty: 5 }];
    expect(importCards(withIslands, [{ name: "island", qty: 10 }, { name: "Forest", qty: 2 }])).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "island", qty: 10 },
      { name: "Forest", qty: 2 },
    ]);
  });
});

describe("priceDeck", () => {
  const offer = (store: string, pricePhp: number) => ({ store, pricePhp, condition: "NM", url: "https://example.com" });
  const found = (...byStore: ReturnType<typeof offer>[]): PriceResponse => ({
    found: true,
    url: "https://tcgph.com/card/x",
    cheapest: byStore[0],
    stores: byStore.length,
    listings: byStore.length,
    byStore,
  });

  const deck: DeckCard[] = [
    { name: "Sol Ring", qty: 1 },
    { name: "Island", qty: 10 },
    { name: "Rhystic Study", qty: 1 },
    { name: "Nowhere Card", qty: 1 },
    { name: "Not Checked Yet", qty: 1 },
  ];
  const prices: Record<string, PriceResponse | undefined> = {
    "Sol Ring": found(offer("Vault", 90), offer("HMO", 110)),
    island: found(offer("HMO", 5), offer("GGH", 8)),
    "Rhystic Study": found(offer("GGH", 1500)),
    "Nowhere Card": { found: false },
  };

  it("adds each card's cheapest price times its quantity", () => {
    const pricing = priceDeck(deck, prices);
    expect(pricing.cheapestTotalPhp).toBe(90 + 10 * 5 + 1500);
    expect(pricing.inStock).toEqual(["Sol Ring", "Island", "Rhystic Study"]);
    expect(pricing.unavailable).toEqual(["Nowhere Card"]);
    expect(pricing.unpriced).toEqual(["Not Checked Yet"]);
  });

  it("ranks stores by how much of the deck they have, then by cost", () => {
    const { stores } = priceDeck(deck, prices);
    expect(stores).toEqual([
      { store: "GGH", cards: 2, totalPhp: 10 * 8 + 1500, missing: ["Sol Ring"] },
      { store: "HMO", cards: 2, totalPhp: 110 + 10 * 5, missing: ["Rhystic Study"] },
      { store: "Vault", cards: 1, totalPhp: 90, missing: ["Island", "Rhystic Study"] },
    ].sort((a, b) => b.cards - a.cards || a.totalPhp - b.totalPhp));
    expect(stores[0].store).toBe("HMO");
  });

  it("is empty for an empty deck", () => {
    expect(priceDeck([], {})).toEqual({
      cheapestTotalPhp: 0,
      inStock: [],
      unavailable: [],
      unpriced: [],
      stores: [],
    });
  });
});
