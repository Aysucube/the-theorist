import { describe, expect, it } from "vitest";
import { parseDeckList } from "@/lib/deck";
import { decodeDeck, deckToText, encodeDeck, isDeckCode } from "./deck-code";

const deck = {
  name: "Lathril Elves",
  commander: "Lathril, Blade of the Elves",
  cards: [
    { name: "Lathril, Blade of the Elves", qty: 1 },
    { name: "Elvish Archdruid", qty: 1 },
    { name: "Forest", qty: 30 },
    { name: "Fire // Ice", qty: 1 },
  ],
};

describe("deck codes", () => {
  it("round-trips a deck through a short, link-safe code", async () => {
    const code = await encodeDeck(deck);
    expect(code).toMatch(/^TT1\.[A-Za-z0-9_-]+$/);
    expect(isDeckCode(code)).toBe(true);
    expect(await decodeDeck(code)).toEqual(deck);
  });

  it("is much shorter than the list for a full deck", async () => {
    const big = { cards: Array.from({ length: 99 }, (_, i) => ({ name: `Some Long Card Name Number ${i}`, qty: 1 })) };
    const code = await encodeDeck(big);
    expect(code.length).toBeLessThan(JSON.stringify(big).length / 2);
    expect((await decodeDeck(code))?.cards).toHaveLength(99);
  });

  it("rejects damaged or foreign codes", async () => {
    expect(await decodeDeck("TT1.not-really-a-code")).toBeNull();
    expect(await decodeDeck("1 Sol Ring")).toBeNull();
    expect(isDeckCode("1 Sol Ring")).toBe(false);
  });
});

describe("deckToText", () => {
  it("lists the commander first, the way deck sites import it, and parses back", () => {
    const text = deckToText(deck);
    expect(text.split("\n").slice(0, 4)).toEqual(["Commander", "1 Lathril, Blade of the Elves", "", "Deck"]);
    expect(parseDeckList(text)).toEqual(expect.arrayContaining(deck.cards));
  });

  it("is a plain list when there's no commander", () => {
    expect(deckToText({ cards: [{ name: "Sol Ring", qty: 1 }] })).toBe("1 Sol Ring");
  });
});
