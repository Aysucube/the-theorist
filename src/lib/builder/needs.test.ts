import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { deckNeeds } from "./needs";
import { builderRecommendations, type BuilderCandidate } from "./plan";

const card = (name: string, typeLine: string, oracleText: string, cmc: number): CardDetails => ({ name, typeLine, oracleText, colorIdentity: ["G"], layout: "normal", keywords: [], cmc });
const spell = (name: string, cmc: number) => card(name, "Sorcery", "Target creature gets +1/+1 until end of turn.", cmc);
const creature = (name: string, cmc: number) => card(name, "Creature — Bear", "", cmc);
const ramp = (name: string, cmc: number) => card(name, "Sorcery", "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", cmc);
const offered = (c: CardDetails, synergy = 0.1, inclusion = 0.2): BuilderCandidate => ({ card: c, synergy, inclusion, lists: ["Top Cards"], ownedCopies: 0 });
const copies = (make: (name: string, cmc: number) => CardDetails, count: number, cmc: number, name = "Filler") => Array.from({ length: count }, (_, i) => ({ card: make(`${name} ${cmc}-${i}`, cmc), qty: 1 }));
const lands = (qty: number) => [{ card: card("Forest", "Basic Land — Forest", "", 0), qty }];

// Twelve spells at each mana value: 2 and 3 short, 6+ far over.
const flatCurve = { counts: [10, 20, 20, 10, 5, 5], average: 3 };

function plan(deck: { card: CardDetails; qty: number }[], candidates: BuilderCandidate[]) {
  return builderRecommendations({ deck, candidates, identity: ["G"], bracket: 3, isGameChanger: () => false, curve: flatCurve, preferOwned: false, combos: null });
}
const names = (picks: { card: CardDetails }[]) => picks.map((p) => p.card.name);

describe("deckNeeds", () => {
  const deck = [...lands(38), ...copies(spell, 6, 1), ...copies(spell, 8, 2), ...copies(spell, 9, 3), ...copies(spell, 6, 4), ...copies(spell, 3, 5), ...copies(spell, 16, 7)];

  it("lists the costs off the curve, with cards for what's short and cuts for what's over", () => {
    const needs = deckNeeds(plan(deck, [offered(spell("Two-drop", 2)), offered(spell("Three-drop", 3)), offered(spell("Seven-drop", 7))]), []);
    const of = (type: string) => needs.moves.find((m) => m.type === type);
    expect(of("2 mana")?.over).toBeLessThan(-1);
    expect(names(of("2 mana")!.picks)).toEqual(["Two-drop"]);
    expect(of("6+ mana")?.over).toBeGreaterThan(1);
    expect(of("6+ mana")?.picks).toEqual([]);
    expect(of("6+ mana")?.cuts).toHaveLength(of("6+ mana")!.over);
  });

  it("leaves a cost alone when it's within a card of its line", () => {
    const needs = deckNeeds(plan(deck, []), []);
    expect(needs.moves.some((m) => m.type === "5 mana")).toBe(false);
  });

  it("puts a card that answers several needs first, saying which", () => {
    const needs = deckNeeds(plan(deck, [offered(spell("Plain two", 2), 0.12), offered(ramp("Cheap ramp", 2), 0.1)]), []);
    expect(names(needs.best)).toEqual(["Cheap ramp"]);
    expect(needs.best[0].reason).toBe("2 mana · Ramp");
  });

  it("sinks a card at a cost that's already full, so filling a gap doesn't tip the curve", () => {
    const needs = deckNeeds(plan(deck, [offered(ramp("Big ramp", 7), 0.12), offered(ramp("Five ramp", 5), 0.1)]), []);
    expect(names(needs.moves.find((m) => m.type === "Ramp")!.picks)).toEqual(["Five ramp", "Big ramp"]);
  });

  it("offers each card once, where it does the most good", () => {
    const needs = deckNeeds(plan(deck, [offered(ramp("Cheap ramp", 2))]), []);
    const shown = [...needs.best, ...needs.moves.flatMap((m) => m.picks)];
    expect(names(shown)).toEqual(["Cheap ramp"]);
  });

  it("asks for the lands the curve wants", () => {
    const short = [...lands(30), ...deck.slice(1)];
    const forest = plan(short, [offered(card("Rich Soil", "Land", "{T}: Add {G}.\nDraw a card.", 0))]);
    const move = deckNeeds(forest, []).moves.find((m) => m.type === "Lands");
    expect(move?.over).toBe(30 - forest.profile.curve.lands.count);
    expect(names(move!.picks)).toEqual(["Rich Soil"]);
  });

  it("says nothing of lands once it has them", () => {
    expect(deckNeeds(plan(deck, []), []).moves.some((m) => m.type === "Lands")).toBe(false);
  });

  it("follows the card types, adding to what's short and cutting what's over", () => {
    const rows = [
      { type: "Creatures", have: 2, aim: 20 },
      { type: "Sorceries", have: 48, aim: 30 },
      { type: "Artifacts", have: 9, aim: 10 },
    ];
    const needs = deckNeeds(plan(deck, [offered(creature("Bear", 4))]), rows);
    expect(names(needs.moves.find((m) => m.type === "Creatures")?.picks ?? [])).toEqual([]);
    expect(needs.best[0].reason).toContain("Creatures");
    expect(needs.moves.find((m) => m.type === "Sorceries")?.over).toBe(18);
    expect(needs.moves.some((m) => m.type === "Artifacts")).toBe(false);
  });

  it("narrows everything to one cost when one is picked", () => {
    const groups = plan(deck, [offered(ramp("Cheap ramp", 2)), offered(ramp("Mid ramp", 4)), offered(spell("Two-drop", 2))]);
    const needs = deckNeeds(groups, [], { cost: 1 });
    const shown = [...needs.best, ...needs.moves.flatMap((m) => m.picks)];
    expect(names(shown).sort()).toEqual(["Cheap ramp", "Two-drop"]);
    expect(needs.moves.some((m) => m.type === "6+ mana")).toBe(false);
  });

  it("keeps lands out of a cost's picks", () => {
    const short = [...lands(30), ...deck.slice(1)];
    const needs = deckNeeds(plan(short, [offered(card("Rich Soil", "Land", "{T}: Add {G}.", 0))]), [], { cost: 0 });
    expect(needs.moves.some((m) => m.type === "Lands")).toBe(false);
  });
});
