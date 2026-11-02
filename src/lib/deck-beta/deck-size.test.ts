import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { afterEdits } from "./color-balance";
import { groupCuts, overCuts, spellCutOrder } from "./deck-size";

const card = (name: string, typeLine: string, oracleText = "", manaCost?: string): CardDetails => ({
  name,
  typeLine,
  oracleText,
  manaCost,
  colorIdentity: [],
  layout: "normal",
  keywords: [],
  cmc: 0,
});

const forest = card("Forest", "Basic Land — Forest", "({T}: Add {G}.)");
const island = card("Island", "Basic Land — Island", "({T}: Add {U}.)");
const tower = card("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity.");
const spell = (name: string, manaCost = "{U}") => card(name, "Sorcery", "", manaCost);
const cut = (name: string, why = "Fills no part of the template", keeps = false) => ({ card: spell(name), why, keeps });

const identity = ["U", "G"];

describe("spellCutOrder", () => {
  it("goes to the most crowded cost first, and back and forth as they even out", () => {
    const order = spellCutOrder([
      { have: 12, target: 10, cards: [cut("A"), cut("B"), cut("C")] },
      { have: 11, target: 10, cards: [cut("D"), cut("E")] },
    ]);
    expect(order.map((c) => c.card.name)).toEqual(["A", "B", "D", "C", "E"]);
  });

  it("leaves cards the deck still needs till last, and says why they're there", () => {
    const order = spellCutOrder([
      { have: 15, target: 10, cards: [cut("Needed", "Keeps Ramp filled", true)] },
      { have: 5, target: 10, cards: [cut("Spare")] },
    ]);
    expect(order.map((c) => c.card.name)).toEqual(["Spare", "Needed"]);
    expect(order[1].why).not.toContain("Keeps");
  });
});

describe("overCuts", () => {
  const slots = [{ have: 2, target: 1, cards: [cut("Weak"), cut("Fine")] }];

  it("cuts spells when the lands are right", () => {
    const cards = [{ card: forest, qty: 38 }, { card: spell("Weak"), qty: 1 }, { card: spell("Fine"), qty: 1 }];
    expect(overCuts({ cards, over: 1, identity, landTarget: 38, slots }).map((c) => c.card.name)).toEqual(["Weak"]);
  });

  it("cuts lands while there are too many, the color with the most to spare first", () => {
    const blue = { card: spell("Blue"), qty: 60 };
    const cards = [blue, { card: forest, qty: 30 }, { card: island, qty: 12 }];
    const cuts = overCuts({ cards, over: 3, identity, landTarget: 40, slots: [] });
    expect(cuts.map((c) => c.card.name)).toEqual(["Forest", "Forest", "Forest"]);
    expect(cuts[0].why).toBe("Green makes more than your spells ask for");
  });

  it("moves on to spells once the lands reach what the curve wants", () => {
    const cards = [{ card: forest, qty: 39 }, { card: spell("Weak"), qty: 1 }, { card: spell("Fine"), qty: 1 }];
    expect(overCuts({ cards, over: 2, identity, landTarget: 38, slots }).map((c) => c.card.name)).toEqual(["Forest", "Weak"]);
  });

  it("explains a basic land that's only over the count", () => {
    const cards = [{ card: spell("Even", "{G}"), qty: 1 }, { card: forest, qty: 39 }];
    expect(overCuts({ cards, over: 1, identity: ["G"], landTarget: 38, slots: [] })[0].why).toBe("More lands than this deck’s curve wants");
  });

  it("turns to lands when there are no spells left to cut", () => {
    const cards = [{ card: forest, qty: 30 }];
    expect(overCuts({ cards, over: 2, identity, landTarget: 38, slots: [] }).map((c) => c.card.name)).toEqual(["Forest", "Forest"]);
  });

  it("never cuts the commander, or lands the mana can't lose", () => {
    const cards = [{ card: tower, qty: 1 }, { card: spell("Atraxa"), qty: 1 }];
    expect(overCuts({ cards, over: 1, identity, commander: "Atraxa", landTarget: 0, slots: [] })).toEqual([]);
  });

  it("brings the deck down by exactly what it's over", () => {
    const cards = [{ card: forest, qty: 40 }, { card: spell("Weak"), qty: 1 }, { card: spell("Fine"), qty: 1 }];
    const cuts = overCuts({ cards, over: 2, identity, landTarget: 38, slots });
    const left = afterEdits(cards, cuts.map((c) => ({ cut: c })));
    expect(left.reduce((sum, { qty }) => sum + qty, 0)).toBe(40);
  });
});

describe("groupCuts", () => {
  it("reads copies of a card as one", () => {
    const groups = groupCuts([cut("A"), cut("A"), cut("B")]);
    expect(groups.map((g) => [g.card.name, g.count])).toEqual([
      ["A", 2],
      ["B", 1],
    ]);
  });
});
