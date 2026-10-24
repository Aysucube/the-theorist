import { describe, expect, it } from "vitest";
import type { CardDetails, Combo } from "@/lib/types";
import { builderRecommendations, fitsIdentity, recommendLands, splitBasics, type BuilderCandidate } from "./plan";

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
  it("starts from EDHREC's average and takes one off for high brackets", () => {
    expect(recommendLands({ average: 36.4, commanderCmc: 3, bracket: 3, commander: "Lathril" })).toMatchObject({ count: 36 });
    const fast = recommendLands({ average: 36.4, commanderCmc: 3, bracket: 4, commander: "Lathril" });
    expect(fast.count).toBe(35);
    expect(fast.why).toMatch(/Lathril decks on EDHREC run 36/);
  });

  it("falls back to 36, nudged by the commander's cost, and stays in range", () => {
    expect(recommendLands({ commanderCmc: 7, bracket: 2, commander: "X" }).count).toBe(37);
    expect(recommendLands({ commanderCmc: 1, bracket: 2, commander: "X" }).count).toBe(35);
    expect(recommendLands({ average: 50, commanderCmc: 3, bracket: 2, commander: "X" }).count).toBe(42);
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

  it("puts owned cards ahead when asked", () => {
    const ramp = run(3).ramp.map((p) => p.card.name);
    expect(ramp.indexOf("Llanowar Elves")).toBeLessThan(ramp.indexOf("Elvish Mystic"));
    const notPreferred = run(3, false).ramp.map((p) => p.card.name);
    expect(notPreferred.indexOf("Elvish Mystic")).toBeLessThan(notPreferred.indexOf("Llanowar Elves"));
  });

  it("offers combo pieces the bracket allows, and lands and next picks", () => {
    const three = run(3);
    expect(three.combos.map((g) => g.pick.card.name)).toEqual(["Staff of Domination"]);
    expect(three.combos[0].pick.reason).toMatch(/Infinite green mana/);
    expect(run(2).combos).toEqual([]);
    expect(three.lands.map((p) => p.card.name)).toEqual(["Gaea's Cradle"]);
    expect(three.next.length).toBeGreaterThan(0);
    expect(three.binder.map((p) => p.card.name)).toContain("Llanowar Elves");
  });
});
