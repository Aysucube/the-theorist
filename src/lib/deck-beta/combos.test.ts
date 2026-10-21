import { describe, expect, it } from "vitest";
import type { CardDetails, Combo } from "@/lib/types";
import {
  cardsSeenByTurn,
  chanceAllSeen,
  combosWith,
  commanderOptions,
  missingPiece,
  simulateConsistency,
  tutorFinds,
  tutorTarget,
} from "./combos";

const card = (name: string, typeLine: string, oracleText = "", extra: Partial<CardDetails> = {}): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity: [],
  layout: "normal",
  keywords: [],
  cmc: 0,
  ...extra,
});

describe("commanderOptions", () => {
  it("lists cards that can lead the deck, those covering its colors first", () => {
    const options = commanderOptions(
      [
        card("Llanowar Elves", "Creature — Elf Druid", "", { power: "1", toughness: "1", colorIdentity: ["G"] }),
        card("Marwyn, the Nurturer", "Legendary Creature — Elf Druid", "", { power: "1", toughness: "1", colorIdentity: ["G"] }),
        card("Lathril, Blade of the Elves", "Legendary Creature — Elf Noble", "", { power: "2", toughness: "3", colorIdentity: ["B", "G"] }),
        card("Hearthhull, the Worldseed", "Legendary Artifact — Spacecraft", "", { power: "6", toughness: "7", colorIdentity: ["B", "R", "G"] }),
      ],
      ["B", "G"],
    );
    expect(options.map((c) => c.name)).toEqual(["Hearthhull, the Worldseed", "Lathril, Blade of the Elves", "Marwyn, the Nurturer"]);
  });
});

describe("tutors", () => {
  it("reads what a tutor can find", () => {
    expect(tutorTarget(card("Demonic Tutor", "Sorcery", "Search your library for a card, put that card into your hand, then shuffle."))).toEqual([]);
    expect(tutorTarget(card("Worldly Tutor", "Instant", "Search your library for a creature card, reveal it, then shuffle and put the card on top."))).toEqual(["creature"]);
    expect(
      tutorTarget(card("Enlightened Tutor", "Instant", "Search your library for an artifact or enchantment card, reveal it, then shuffle.")),
    ).toEqual(["artifact", "enchantment"]);
  });

  it("doesn't count land ramp or named-card searches as combo tutors", () => {
    expect(tutorTarget(card("Cultivate", "Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand."))).toBeNull();
    expect(tutorTarget(card("Sol Ring", "Artifact", "{T}: Add {C}{C}."))).toBeNull();
  });

  it("matches tutors to pieces by type", () => {
    expect(tutorFinds(["creature"], card("Walking Ballista", "Artifact Creature — Construct"))).toBe(true);
    expect(tutorFinds(["creature"], card("Basalt Monolith", "Artifact"))).toBe(false);
    expect(tutorFinds([], card("Basalt Monolith", "Artifact"))).toBe(true);
  });
});

describe("odds", () => {
  it("counts the cards seen by a turn on the play", () => {
    expect(cardsSeenByTurn(1)).toBe(7);
    expect(cardsSeenByTurn(8)).toBe(14);
  });

  it("works out the chance of seeing specific cards", () => {
    expect(chanceAllSeen(1, 99, 7)).toBeCloseTo(7 / 99);
    expect(chanceAllSeen(2, 99, 14)).toBeCloseTo((14 / 99) * (13 / 98));
    expect(chanceAllSeen(0, 99, 7)).toBe(1);
    expect(chanceAllSeen(3, 99, 2)).toBe(0);
  });

  it("simulates assembling a combo, and tutors make it likelier", () => {
    const library = ["A", "B", ...Array.from({ length: 95 }, (_, i) => `filler ${i}`)];
    const details = new Map([
      ["A", card("A", "Artifact")],
      ["B", card("B", "Creature — Construct")],
    ]);
    const plain = simulateConsistency({ library, combos: [["A", "B"]], tutors: new Map(), details, turns: [8], runs: 6000 });
    expect(plain[8]).toBeCloseTo(chanceAllSeen(2, 97, 14), 1);

    const withTutors = [...library.slice(0, 92), "Tutor 1", "Tutor 2", "Tutor 3", "Tutor 4", "Tutor 5"];
    const tutors = new Map(["Tutor 1", "Tutor 2", "Tutor 3", "Tutor 4", "Tutor 5"].map((t) => [t, [] as string[]]));
    const tutored = simulateConsistency({ library: withTutors, combos: [["A", "B"]], tutors, details, turns: [4, 8], runs: 6000 });
    expect(tutored[8]).toBeGreaterThan(plain[8] * 2);
    expect(tutored[4]).toBeLessThanOrEqual(tutored[8]);
  });

  it("gives the same answer every time", () => {
    const input = { library: ["A", "B", "C", "D", "E"], combos: [["A", "B"]], tutors: new Map(), details: new Map(), turns: [1] };
    expect(simulateConsistency(input)).toEqual(simulateConsistency(input));
  });
});

describe("combos in a deck", () => {
  const combo: Combo = {
    id: "1",
    cards: ["Basalt Monolith", "Rings of Brighthearth"],
    templates: [],
    results: ["Infinite colorless mana"],
    steps: "",
    prerequisites: "",
    url: "",
  };

  it("finds which piece a combo is missing, and which combos use a card", () => {
    expect(missingPiece(combo, ["basalt monolith", "Sol Ring"])).toBe("Rings of Brighthearth");
    expect(missingPiece(combo, ["Basalt Monolith", "Rings of Brighthearth"])).toBeUndefined();
    expect(combosWith([combo], "rings of brighthearth")).toEqual([combo]);
    expect(combosWith([combo], "Sol Ring")).toEqual([]);
  });
});
