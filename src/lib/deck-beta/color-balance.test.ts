import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { afterSwaps, balanceColors, colorGap, groupSwaps, isBalanced, type BalanceInput } from "./color-balance";
import { colorDistribution } from "./lands";

const card = (name: string, typeLine: string, oracleText: string, manaCost?: string): CardDetails => ({
  name,
  typeLine,
  oracleText,
  manaCost,
  colorIdentity: [],
  layout: "normal",
  keywords: [],
  cmc: 0,
});

const basic = (name: string, type: string, symbol: string) => card(name, `Basic Land — ${type}`, `({T}: Add {${symbol}}.)`);
const forest = basic("Forest", "Forest", "G");
const island = basic("Island", "Island", "U");
const breeding = card("Breeding Pool", "Land — Forest Island", "({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.");
const hinterland = card("Hinterland Harbor", "Land", "This land enters tapped unless you control a Forest or an Island.\n{T}: Add {G} or {U}.");
const guildgate = card("Simic Guildgate", "Land — Gate", "This land enters tapped.\n{T}: Add {G} or {U}.");
const tower = card("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity.");
const rogues = card("Rogue's Passage", "Land", "{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn.");
const spell = (name: string, manaCost: string) => card(name, "Sorcery", "", manaCost);

const identity = ["U", "G"];
const blueSpells = { card: spell("Blue Spells", "{U}{U}{U}"), qty: 30 };
const greenSpells = { card: spell("Green Spells", "{G}"), qty: 30 };

const input = (over: Partial<BalanceInput>): BalanceInput => ({
  cards: [],
  identity,
  lands: [],
  basics: [forest, island],
  owned: () => 0,
  landTarget: 38,
  ...over,
});

describe("balanceColors", () => {
  it("brings the lands to what the spells ask for, cutting the color with too much", () => {
    const cards = [blueSpells, greenSpells, { card: forest, qty: 30 }, { card: island, qty: 10 }];
    const { swaps } = balanceColors(input({ cards }));
    const before = colorDistribution(cards, identity);
    const after = colorDistribution(afterSwaps(cards, swaps), identity);
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.every((s) => s.add.name === "Island" && s.cut?.card.name === "Forest")).toBe(true);
    expect(colorGap(after)).toBeLessThan(colorGap(before));
    expect(isBalanced(after)).toBe(true);
    expect(swaps[0].cut?.why).toBe("Green makes more than your spells ask for");
  });

  it("brings in duals first while the mana base has room, your own before the rest", () => {
    const cards = [blueSpells, greenSpells, { card: forest, qty: 30 }, { card: island, qty: 10 }];
    const { swaps } = balanceColors(input({ cards, lands: [hinterland, breeding], owned: (name) => (name === "Breeding Pool" ? 1 : 0) }));
    expect(swaps[0]).toMatchObject({ add: breeding, makes: ["U", "G"], label: "Untapped dual" });
    expect(swaps[1].add).toBe(hinterland);
    expect(swaps.slice(2).every((s) => s.add.name === "Island")).toBe(true);
  });

  it("skips lands that always enter tapped, and lands already in the deck", () => {
    const cards = [blueSpells, greenSpells, { card: breeding, qty: 1 }, { card: forest, qty: 29 }, { card: island, qty: 10 }];
    const { swaps } = balanceColors(input({ cards, lands: [guildgate, breeding] }));
    expect(swaps.some((s) => s.add.name === "Simic Guildgate" || s.add.name === "Breeding Pool")).toBe(false);
  });

  it("cuts nothing while the deck has room", () => {
    const cards = [{ ...blueSpells, qty: 20 }, { ...greenSpells, qty: 20 }, { card: forest, qty: 10 }, { card: island, qty: 2 }];
    const { swaps } = balanceColors(input({ cards }));
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.every((s) => s.cut === undefined)).toBe(true);
  });

  it("starts cutting once the deck is full", () => {
    const cards = [blueSpells, { ...greenSpells, qty: 29 }, { card: forest, qty: 30 }, { card: island, qty: 10 }];
    const { swaps } = balanceColors(input({ cards, landTarget: 45 }));
    expect(swaps[0].cut).toBeUndefined();
    expect(swaps[1].cut?.card.name).toBe("Forest");
  });

  it("swaps instead of adding once the deck has the lands it wants, however few cards it has", () => {
    const cards = [{ ...blueSpells, qty: 5 }, { ...greenSpells, qty: 5 }, { card: forest, qty: 30 }, { card: island, qty: 8 }];
    const { swaps } = balanceColors(input({ cards }));
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.every((s) => s.cut?.card.name === "Forest")).toBe(true);
  });

  it("only adds what the colors need to a deck that's still being built", () => {
    const cards = [{ ...blueSpells, qty: 5 }, { ...greenSpells, qty: 5 }, { card: forest, qty: 8 }, { card: island, qty: 2 }];
    const { swaps } = balanceColors(input({ cards }));
    const after = colorDistribution(afterSwaps(cards, swaps), identity);
    expect(swaps.map((s) => s.add.name)).toEqual(Array(swaps.length).fill("Island"));
    expect(swaps.length).toBeLessThanOrEqual(21);
    expect(after.colors.every((c) => Math.round(c.short) === 0)).toBe(true);
    // Stopping there: one more would overshoot.
    expect(balanceColors(input({ cards: afterSwaps(cards, swaps), lands: [breeding] })).swaps).toEqual([]);
  });

  it("offers the lands that could go, and leaves good ones alone", () => {
    const cards = [blueSpells, greenSpells, { card: tower, qty: 1 }, { card: breeding, qty: 1 }, { card: rogues, qty: 1 }, { card: guildgate, qty: 1 }, { card: forest, qty: 36 }];
    const { cuts, swaps } = balanceColors(input({ cards }));
    expect(cuts.map((c) => [c.card.name, c.why])).toEqual([
      ["Rogue's Passage", "Makes none of your colors"],
      ["Simic Guildgate", "Always enters tapped"],
      ["Forest", "Green makes more than your spells ask for"],
    ]);
    expect(swaps.some((s) => ["Command Tower", "Breeding Pool"].includes(s.cut?.card.name ?? ""))).toBe(false);
  });

  it("keeps utility lands the mana base has room for, and offers them as other cuts", () => {
    const cards = [blueSpells, greenSpells, { card: rogues, qty: 1 }, { card: forest, qty: 39 }];
    const { swaps, cuts } = balanceColors(input({ cards }));
    expect(swaps.some((s) => s.cut?.card.name === "Rogue's Passage")).toBe(false);
    expect(cuts.some((c) => c.card.name === "Rogue's Passage")).toBe(true);

    const reliquary = card("Reliquary Tower", "Land", "You have no maximum hand size.\n{T}: Add {C}.");
    const crowded = [blueSpells, greenSpells, ...[rogues, reliquary].map((c) => ({ card: c, qty: 3 })), { card: forest, qty: 34 }];
    const cutNames = balanceColors(input({ cards: crowded, identity: ["W", "U", "B", "G"], basics: [forest, island] })).swaps.map((s) => s.cut?.card.name);
    expect(cutNames).toContain("Rogue's Passage");
  });

  it("never cuts the commander", () => {
    const dryad = card("Dryad Arbor", "Land Creature — Forest Dryad", "");
    const cards = [blueSpells, greenSpells, { card: dryad, qty: 1 }, { card: forest, qty: 29 }, { card: island, qty: 10 }];
    const { swaps, cuts } = balanceColors(input({ cards, commander: "Dryad Arbor" }));
    expect(cuts.some((c) => c.card.name === "Dryad Arbor")).toBe(false);
    expect(swaps.some((s) => s.cut?.card.name === "Dryad Arbor")).toBe(false);
  });

  it("cuts a spell when no land can go and the deck wants more lands", () => {
    const filler = { card: spell("Filler", "{1}"), qty: 1 };
    const cards = [{ ...blueSpells, qty: 40 }, { ...greenSpells, qty: 22 }, filler, { card: tower, qty: 1 }, { card: card("Yavimaya Hollow", "Land", "{T}: Add {G}.\n{G}, {T}: Regenerate target creature."), qty: 36 }];
    const cut = { card: filler.card, why: "Fills no part of the template" };
    expect(balanceColors(input({ cards, spellCuts: [cut], landTarget: 38 })).swaps[0]).toMatchObject({ add: { name: "Island" }, cut });
    expect(balanceColors(input({ cards, spellCuts: [cut], landTarget: 37 })).swaps).toEqual([]);
  });

  it("has nothing to do for a balanced deck, or a deck of one color", () => {
    const even = [greenSpells, { ...blueSpells, card: spell("Blue", "{U}") }, { card: forest, qty: 19 }, { card: island, qty: 19 }];
    expect(balanceColors(input({ cards: even, lands: [breeding] })).swaps).toEqual([]);
    expect(balanceColors(input({ cards: [greenSpells, { card: forest, qty: 38 }], identity: ["G"], basics: [forest], lands: [breeding] })).swaps).toEqual([]);
  });

  it("goes as far as it takes, even for a deck that's all one color of land", () => {
    const cards = [{ ...blueSpells, card: spell("Blue", "{U}") }, { ...greenSpells, card: spell("Green", "{G}") }, { card: forest, qty: 38 }];
    const { swaps } = balanceColors(input({ cards }));
    // The deck has the 38 lands it wants, so each one replaces a Forest.
    expect(swaps).toHaveLength(19);
    expect(swaps.filter((s) => s.cut)).toHaveLength(19);
    expect(isBalanced(colorDistribution(afterSwaps(cards, swaps), identity))).toBe(true);
  });
});

describe("afterSwaps", () => {
  it("adds and cuts copies, and drops a card with none left", () => {
    const deck = [{ card: forest, qty: 2 }, { card: guildgate, qty: 1 }];
    const next = afterSwaps(deck, [
      { add: island, cut: { card: forest, why: "" } },
      { add: island, cut: { card: guildgate, why: "" } },
      { add: breeding },
    ]);
    expect(next.map((l) => [l.card.name, l.qty])).toEqual([
      ["Forest", 1],
      ["Island", 2],
      ["Breeding Pool", 1],
    ]);
  });
});

describe("groupSwaps", () => {
  it("reads the same swap made twice as one line", () => {
    const cut = { card: forest, why: "" };
    const swap = { add: island, makes: ["U"], label: "Basic", cut };
    const groups = groupSwaps([swap, swap, { ...swap, add: breeding }]);
    expect(groups.map((g) => [g.add.name, g.count])).toEqual([
      ["Island", 2],
      ["Breeding Pool", 1],
    ]);
  });
});

describe("isBalanced", () => {
  it("allows a land either way on each color", () => {
    const close = colorDistribution([greenSpells, { ...blueSpells, card: spell("Blue", "{U}") }, { card: forest, qty: 20 }, { card: island, qty: 18 }], identity);
    const far = colorDistribution([greenSpells, { ...blueSpells, card: spell("Blue", "{U}") }, { card: forest, qty: 28 }, { card: island, qty: 10 }], identity);
    expect(isBalanced(close)).toBe(true);
    expect(isBalanced(far)).toBe(false);
  });
});
