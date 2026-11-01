import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { BALANCED_GUIDE, closersIn, playstyleGuide } from "./playstyle-guide";

const card = (name: string, oracleText: string, typeLine = "Sorcery"): CardDetails => ({ name, oracleText, typeLine, colorIdentity: [], layout: "normal", keywords: [], cmc: 3 });

describe("playstyleGuide", () => {
  it("explains a playstyle and how it wins", () => {
    const guide = playstyleGuide("aristocrats", "Aristocrats");
    expect(guide.about).toMatch(/Sacrifices its own creatures/);
    expect(guide.wins.length).toBeGreaterThanOrEqual(3);
  });

  it("writes creature types out from the type's name", () => {
    expect(playstyleGuide("elves", "Elves").about).toMatch(/Fills the deck with Elves/);
    expect(playstyleGuide("elves", "Elves").wins[0]).toMatch(/board of Elves/);
  });

  it("knows a companion's name", () => {
    expect(playstyleGuide("lurrus-companion", "Lurrus Companion").about).toMatch(/meet Lurrus's rule/);
  });

  it("still says something for a playstyle it doesn't know", () => {
    const guide = playstyleGuide("something-new", "Something New");
    expect(guide.about).toMatch(/Something New/);
    expect(guide.wins.length).toBeGreaterThan(0);
  });

  it("has an entry for a balanced deck", () => {
    expect(BALANCED_GUIDE.wins.length).toBeGreaterThan(0);
  });
});

describe("closersIn", () => {
  const cards = [
    { name: "Craterhoof Behemoth", numDecks: 1 },
    { name: "Sol Ring", numDecks: 1 },
    { name: "Gray Merchant", numDecks: 1 },
    { name: "Laboratory Maniac", numDecks: 1 },
    { name: "Hidden Land", numDecks: 1 },
    { name: "Unknown", numDecks: 1 },
  ];
  const details = {
    "Craterhoof Behemoth": card("Craterhoof Behemoth", "When this creature enters, creatures you control gain trample and get +X/+X until end of turn.", "Creature — Beast"),
    "Sol Ring": card("Sol Ring", "{T}: Add {C}{C}.", "Artifact"),
    "Gray Merchant": card("Gray Merchant", "Each opponent loses X life.", "Creature — Zombie"),
    "Laboratory Maniac": card("Laboratory Maniac", "If you would draw a card while your library has no cards in it, you win the game instead.", "Creature — Wizard"),
    "Hidden Land": card("Hidden Land", "{T}: you win the game.", "Land"),
  };

  it("finds the cards that end games, in the playstyle's order, and says how", () => {
    expect(closersIn(cards, details)).toEqual([
      { name: "Craterhoof Behemoth", how: "Pumps the team" },
      { name: "Gray Merchant", how: "Drains the table" },
      { name: "Laboratory Maniac", how: "Wins on the spot" },
    ]);
  });

  it("stops at the limit", () => {
    expect(closersIn(cards, details, 1)).toHaveLength(1);
  });
});
