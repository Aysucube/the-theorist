import { describe, expect, it } from "vitest";
import type { CardDetails, EdhrecDeckAverages } from "@/lib/types";
import { typeMoves, typeRatio } from "./card-types";
import type { BuilderPick } from "./plan";

const card = (name: string, typeLine: string): CardDetails => ({ name, typeLine, oracleText: "", colorIdentity: [], layout: "normal", keywords: [], cmc: 3 });
const averages: EdhrecDeckAverages = { lands: 36, basics: 13, nonbasics: 23, creatures: 24, instants: 10, sorceries: 8, artifacts: 9, enchantments: 7, planeswalkers: 5, battles: 0 };
const aims = (rows: ReturnType<typeof typeRatio>) => Object.fromEntries(rows.map((r) => [r.type, r.aim]));
const pick = (c: CardDetails, synergy: number) => ({ card: c, synergy, lists: [] }) as unknown as BuilderPick;

describe("typeRatio", () => {
  it("counts each card as one type, without the commander", () => {
    const rows = typeRatio(
      [
        { card: card("Atraxa, Praetors' Voice", "Legendary Creature — Phyrexian Angel Horror"), qty: 1 },
        { card: card("Solemn Simulacrum", "Artifact Creature — Golem"), qty: 1 },
        { card: card("Sol Ring", "Artifact"), qty: 1 },
        { card: card("Forest", "Basic Land — Forest"), qty: 30 },
      ],
      { commander: "Atraxa, Praetors' Voice" },
    );
    expect(rows.map((r) => [r.type, r.have])).toEqual([["Creatures", 1], ["Artifacts", 1], ["Lands", 30]]);
    expect(rows.every((r) => r.aim === undefined)).toBe(true);
  });

  it("takes EDHREC's average as it stands, 99 cards in all", () => {
    const rows = typeRatio([], { averages });
    expect(aims(rows)).toEqual({ Creatures: 24, Planeswalkers: 5, Instants: 10, Sorceries: 8, Artifacts: 9, Enchantments: 7, Lands: 36 });
    expect(rows.reduce((sum, r) => sum + (r.aim ?? 0), 0)).toBe(99);
  });

  it("scales the spells to fit the lands the deck is set to run", () => {
    const rows = typeRatio([], { averages, lands: 40 });
    expect(aims(rows).Lands).toBe(40);
    expect(rows.reduce((sum, r) => sum + (r.aim ?? 0), 0)).toBe(99);
    expect(aims(rows).Creatures).toBeLessThan(24);
  });

  it("counts basics the deck hasn't added yet", () => {
    expect(typeRatio([], { basics: 12 })).toEqual([{ type: "Lands", have: 12, aim: undefined }]);
  });

  it("keeps a type EDHREC's decks don't play when the deck has some", () => {
    const rows = typeRatio([{ card: card("Invasion of Ikoria", "Battle — Siege"), qty: 1 }], { averages });
    expect(rows.find((r) => r.type === "Battles")).toEqual({ type: "Battles", have: 1, aim: 0 });
  });
});

describe("typeMoves", () => {
  const empty = { combos: [], lands: { duals: [], fixing: [], utility: [], slow: [] }, leftOut: [], threats: [], threatTarget: 0 };
  const shelf = (picks: BuilderPick[], heldBack: BuilderPick[] = []) => ({ category: "plan" as const, short: 0, leaning: [], lists: [{ title: "Creatures", picks }], moreForStyle: [], outside: [], heldBack, all: { leaning: [], synergy: [], rest: [] } });
  const bear = card("Bear", "Creature — Bear");
  const wolf = card("Wolf", "Creature — Wolf");
  const barred = card("Barred", "Creature — Horror");
  const spell = (name: string, inclusion?: number, keeps = false) => ({ card: card(name, "Instant"), why: "Weak", inclusion, keeps });

  it("offers the strongest cards of a short type, within the bracket", () => {
    const groups = { ...empty, template: [shelf([pick(wolf, 0.1), pick(bear, 0.5)], [pick(barred, 0.9)])], curveSlots: [] };
    const [move] = typeMoves([{ type: "Creatures", have: 10, aim: 24 }], groups);
    expect(move.over).toBe(-14);
    expect(move.picks.map((p) => p.card.name)).toEqual(["Bear", "Wolf"]);
  });

  it("cuts what these decks play least from a type it has too many of, as many as it's over", () => {
    const groups = { ...empty, template: [], curveSlots: [{ slot: 1, have: 3, target: 1, cards: [spell("Staple", 0.6), spell("Rare", 0.05), spell("Unseen")] }] };
    const [move] = typeMoves([{ type: "Instants", have: 12, aim: 10 }], groups);
    expect(move.cuts.map((c) => [c.card.name, c.why])).toEqual([["Unseen", "Not in these decks"], ["Rare", "5% of these decks"]]);
  });

  it("keeps a card the template still needs till last", () => {
    const groups = { ...empty, template: [], curveSlots: [{ slot: 1, have: 3, target: 1, cards: [spell("Needed", 0.01, true), spell("Spare", 0.5)] }] };
    const [move] = typeMoves([{ type: "Instants", have: 12, aim: 10 }], groups);
    expect(move.cuts.map((c) => c.card.name)).toEqual(["Spare", "Needed"]);
  });

  it("leaves a type alone when it's within a card, and lands to the mana base", () => {
    const groups = { ...empty, template: [shelf([pick(bear, 0.5)])], curveSlots: [] };
    expect(typeMoves([{ type: "Creatures", have: 23, aim: 24 }, { type: "Lands", have: 30, aim: 36 }], groups)).toEqual([]);
  });

  it("has nothing to say without EDHREC's numbers", () => {
    const groups = { ...empty, template: [shelf([pick(bear, 0.5)])], curveSlots: [] };
    expect(typeMoves([{ type: "Creatures", have: 3 }], groups)).toEqual([]);
  });
});
