import { describe, expect, it } from "vitest";
import type { CardDetails, Combo } from "@/lib/types";
import { builderRecommendations, fitsIdentity, predictedAverage, recommendLands, splitBasics, type BuilderCandidate } from "./plan";

const card = (name: string, typeLine: string, oracleText: string, extra: Partial<CardDetails> = {}): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity: ["G"],
  layout: "normal",
  keywords: [],
  cmc: 2,
  ...extra,
});

describe("recommendLands", () => {
  it("follows the curve: 38 at mid-range, fewer for a low curve, more for a high one", () => {
    expect(recommendLands({})).toMatchObject({ count: 38 });
    expect(recommendLands({ curveAverage: 3.3 }).count).toBe(38);
    expect(recommendLands({ curveAverage: 2.4 }).count).toBe(34);
    expect(recommendLands({ curveAverage: 4.5 }).count).toBe(40);
    expect(recommendLands({ curveAverage: 2.4 }).why).toMatch(/2.4 mana/);
  });

  it("predicts the curve from the commander's most-played cards on EDHREC", () => {
    const spell = (cmc: number, inclusion: number) => ({ card: card(`Card ${cmc}-${inclusion}`, "Instant", "", { cmc }), inclusion });
    const cards = [...Array.from({ length: 12 }, (_, i) => spell(2, 0.9 - i * 0.01)), spell(9, 0.01)];
    expect(predictedAverage(cards, 12)).toBe(2);
    expect(predictedAverage(cards.slice(0, 3))).toBeUndefined();
  });
});

describe("splitBasics", () => {
  it("weights colors by the mana symbols the deck asks for, and always adds up", () => {
    const split = splitBasics(28, ["B", "G"], ["{2}{G}{G}", "{G}", "{1}{G}", "{B}", "{G/B}"]);
    expect(split.Forest).toBeGreaterThan(split.Swamp);
    expect(split.Forest + split.Swamp).toBe(28);
  });

  it("gives colorless decks Wastes, and splits evenly with no spells yet", () => {
    expect(splitBasics(30, [], [])).toEqual({ Wastes: 30 });
    expect(splitBasics(30, ["W", "U", "B"], [])).toEqual({ Plains: 10, Island: 10, Swamp: 10 });
  });
});

describe("builderRecommendations", () => {
  const commander = card("Lathril, Blade of the Elves", "Legendary Creature — Elf Noble", "Menace", { colorIdentity: ["B", "G"] });
  const candidate = (c: CardDetails, extra: Partial<BuilderCandidate> = {}): BuilderCandidate => ({ card: c, ownedCopies: 0, lists: [], inclusion: 0.3, ...extra });
  const candidates = [
    candidate(card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}."), { ownedCopies: 1 }),
    candidate(card("Elvish Mystic", "Creature — Elf Druid", "{T}: Add {G}."), { inclusion: 0.8 }),
    candidate(card("Beast Within", "Instant", "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.")),
    candidate(card("Harmonize", "Sorcery", "Draw three cards.")),
    candidate(card("Swords to Plowshares", "Instant", "Exile target creature.", { colorIdentity: ["W"] })),
    candidate(card("Staff of Domination", "Artifact", "{3}, {T}: Untap target creature.\n{5}, {T}: Draw a card.", { colorIdentity: [] })),
    candidate(card("Gaea's Cradle", "Legendary Land", "{T}: Add {G} for each creature you control."), { lists: ["Lands"], inclusion: 0.5 }),
    candidate(card("Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.", { colorIdentity: ["U"] })),
    candidate(card("Dryad Arbor Scout", "Creature — Elf", "{T}: Add {G}. Whenever this creature attacks, draw two cards."), { inclusion: 0.2 }),
    candidate(card("Elvish Archdruid", "Creature — Elf Druid", "{T}: Add {G} for each Elf you control."), { synergy: 0.4, inclusion: 0.1 }),
    candidate(card("Priest of the Grove", "Creature — Elf Druid", "{T}: Add {G}."), { synergy: 0.05, inclusion: 0.9, ownedCopies: 1 }),
  ];
  const staffCombo: Combo = {
    id: "staff",
    cards: ["Staff of Domination", "Priest of Titania"],
    templates: [],
    results: ["Infinite green mana"],
    steps: "",
    prerequisites: "",
    url: "",
    bracketTag: "S",
  };
  const shelf = (result: ReturnType<typeof run>, category: string) => result.template.find((g) => g.category === category)!;
  const names = (picks: { card: CardDetails }[]) => picks.map((p) => p.card.name);
  const run = (bracket: 2 | 3, preferOwned = true) =>
    builderRecommendations({
      deck: [
        { card: commander, qty: 1 },
        { card: card("Priest of Titania", "Creature — Elf Druid", "{T}: Add {G} for each Elf on the battlefield."), qty: 1 },
      ],
      candidates,
      identity: ["B", "G"],
      bracket,
      isGameChanger: () => false,
      combos: { included: [], almostIncluded: [staffCombo] },
      preferOwned,
    });

  it("only suggests cards in the commander's colors", () => {
    const all = Object.values(run(3)).flatMap((g) => (Array.isArray(g) ? g : []));
    const names = JSON.stringify(all);
    expect(names).not.toContain("Swords to Plowshares");
    expect(names).not.toContain("Rhystic Study");
    expect(fitsIdentity({ colorIdentity: [] }, ["G"])).toBe(true);
  });

  it("has a shelf for every category of the template, with how short it is", () => {
    const three = run(3);
    expect(three.template.map((g) => g.category)).toEqual(["ramp", "advantage", "targeted", "mass", "plan"]);
    expect(shelf(three, "mass").short).toBe(6);
  });

  it("leads each shelf with EDHREC's highest synergy, then flexible cards, then the rest", () => {
    const ramp = shelf(run(3, false), "ramp");
    expect(names(ramp.synergy)).toEqual(["Elvish Archdruid", "Priest of the Grove"]);
    expect(ramp.synergy[0].reason).toBe("+40% synergy");
    expect(names(ramp.flexible)).toEqual(["Dryad Arbor Scout"]);
    expect(names(ramp.more)).toEqual(["Elvish Mystic", "Llanowar Elves"]);
  });

  it("lists enough high-synergy cards to fill a category's gap", () => {
    const result = builderRecommendations({ deck: [{ card: commander, qty: 1 }], candidates, identity: ["B", "G"], bracket: 3, isGameChanger: () => false, preferOwned: false, perGroup: 1 });
    expect(names(shelf(result, "ramp").synergy)).toEqual(["Elvish Archdruid", "Priest of the Grove"]);
    expect(shelf(result, "ramp").flexible).toHaveLength(1);
  });

  it("offers a flexible card in each category it fills", () => {
    const three = run(3, false);
    expect(names(shelf(three, "ramp").flexible)).toContain("Dryad Arbor Scout");
    expect(names(shelf(three, "advantage").flexible)).toContain("Dryad Arbor Scout");
  });

  it("puts owned cards ahead within each part of a shelf when asked", () => {
    const ramp = shelf(run(3), "ramp");
    expect(names(ramp.synergy)).toEqual(["Priest of the Grove", "Elvish Archdruid"]);
    expect(names(ramp.more)).toEqual(["Llanowar Elves", "Elvish Mystic"]);
  });

  it("offers Game Changers only as far as the bracket has room", () => {
    const gameChanger = candidate(card("Crop Rotation", "Instant", "Search your library for a land card, put that card onto the battlefield."), { synergy: 0.5 });
    const build = (bracket: 2 | 3) =>
      builderRecommendations({ deck: [{ card: commander, qty: 1 }], candidates: [gameChanger], identity: ["B", "G"], bracket, isGameChanger: () => true, preferOwned: false });
    expect(names(shelf(build(3), "ramp").synergy)).toEqual(["Crop Rotation"]);
    expect(names(shelf(build(2), "ramp").synergy)).toEqual([]);
    expect(build(2).leftOut.map((l) => l.pick.card.name)).toEqual(["Crop Rotation"]);
  });

  it("keeps a card out of the plan's later parts once it's shown higher up", () => {
    const staff = candidate(card("Staff of Domination", "Artifact", "{3}, {T}: Untap target creature.", { colorIdentity: [] }), { synergy: 0.6 });
    const elves = candidate(card("Wirewood Symbiote", "Creature — Elf", "Return an Elf you control to its owner's hand."), { inclusion: 0.2 });
    const result = builderRecommendations({
      deck: [{ card: commander, qty: 1 }],
      candidates: [staff, elves],
      identity: ["B", "G"],
      bracket: 3,
      isGameChanger: () => false,
      combos: { included: [], almostIncluded: [staffCombo] },
      playstyle: [{ name: "Staff of Domination" }, { name: "Wirewood Symbiote" }] as never,
      preferOwned: false,
      perGroup: 1,
    });
    expect(names(shelf(result, "plan").synergy)).toEqual(["Staff of Domination"]);
    expect(shelf(result, "plan").synergy[0].reason).toMatch(/Infinite green mana/);
    expect(result.combos).toEqual([]);
    expect(names(result.playstyle)).toEqual(["Wirewood Symbiote"]);
    expect(names(shelf(result, "plan").more)).toEqual([]);
  });

  it("offers combo pieces the bracket allows, lands, and plans the mana base by colors", () => {
    const three = run(3);
    expect(three.combos.map((g) => g.pick.card.name)).toEqual(["Staff of Domination"]);
    expect(three.combos[0].pick.reason).toMatch(/Infinite green mana/);
    expect(run(2).combos).toEqual([]);
    expect(three.lands.map((p) => p.card.name)).toEqual(["Gaea's Cradle"]);
    expect(three.lands[0].reason).toBeDefined();
    expect(three.manaBase.colors).toBe(2);
  });
});
