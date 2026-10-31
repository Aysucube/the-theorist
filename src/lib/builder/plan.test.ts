import { describe, expect, it } from "vitest";
import type { CardDetails, Combo } from "@/lib/types";
import { builderRecommendations, fitsIdentity, predictedAverage, recommendLands, splitBasics, styleLean, withPlaystyle, type BuilderCandidate } from "./plan";

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

describe("styleLean", () => {
  it("is how much more a playstyle's decks play a card than the commander's decks overall", () => {
    expect(styleLean(0.4, 0.25, 100000, undefined)).toBeCloseTo(0.15, 2);
    expect(styleLean(0.17, undefined, 100000, undefined)).toBeCloseTo(0.17, 2);
  });

  it("trusts a few decks less", () => {
    expect(styleLean(1, 0, 20, undefined)).toBeCloseTo(0.5);
    expect(styleLean(1, 0, 1, undefined)).toBeLessThan(0.05);
  });

  it("takes the card's pull in these colors when that's higher, and is never below zero", () => {
    expect(styleLean(0.5, 0.5, 1000, 0.2)).toBe(0.2);
    expect(styleLean(undefined, undefined, 0, 0.18)).toBe(0.18);
    expect(styleLean(0.3, 0.5, 1000, -0.1)).toBe(0);
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
    expect(names(three.lands.utility)).toEqual(["Gaea's Cradle"]);
    expect(three.lands.utility[0].reason).toBeDefined();
    expect(three.manaBase.colors).toBe(2);
  });

  describe("with a playstyle chosen", () => {
    const ramp = (name: string, extra: Partial<BuilderCandidate> = {}) => candidate(card(name, "Creature — Elf Druid", "{T}: Add {G}."), extra);
    const build = (cards: BuilderCandidate[], playstyle: { name: string; synergy?: number; inclusion?: number; lean?: number }[], preferOwned = false) =>
      builderRecommendations({
        deck: [{ card: commander, qty: 1 }],
        candidates: cards,
        identity: ["B", "G"],
        bracket: 3,
        isGameChanger: () => false,
        playstyle: playstyle.map((p) => ({ numDecks: 10, ...p })),
        preferOwned,
      });

    it("ranks cards by that playstyle's decks, not the commander's", () => {
      const cards = [ramp("Commander Favorite", { synergy: 0.9 }), ramp("Style Favorite", { synergy: 0.1 })];
      const style = [
        { name: "Commander Favorite", synergy: 0.05 },
        { name: "Style Favorite", synergy: 0.7 },
      ];
      const shelfOf = shelf(build(cards, style), "ramp");
      expect(names(shelfOf.synergy)).toEqual(["Style Favorite", "Commander Favorite"]);
      expect(shelfOf.synergy[0].reason).toBe("+70% synergy");
    });

    it("leads with the cards that set it apart, ahead of the commander's core", () => {
      const cards = [ramp("Core Card", { synergy: 0.8 }), ramp("Burn Card", { synergy: 0.1 }), ramp("Binder Burn Card", { ownedCopies: 1, inclusion: undefined })];
      const style = [
        { name: "Core Card", synergy: 0.8, lean: 0.01 },
        { name: "Burn Card", synergy: 0.1, lean: 0.14 },
        { name: "Binder Burn Card", synergy: 0.05, lean: 0.2 },
      ];
      const shelfOf = shelf(build(cards, style), "ramp");
      expect(names(shelfOf.leaning)).toEqual(["Binder Burn Card", "Burn Card"]);
      expect(shelfOf.leaning[0].reason).toBe("+20% in this playstyle");
      expect(names(shelfOf.synergy)).toEqual(["Core Card"]);
    });

    it("ranks all of a shelf's cards by synergy for looking through by cost, whatever you own", () => {
      const cards = [
        ramp("Outside", { ownedCopies: 1 }),
        ramp("No Synergy", { ownedCopies: 1 }),
        ramp("Core", { synergy: 0.9 }),
        ramp("Leaning", { ownedCopies: 0 }),
        ...Array.from({ length: 13 }, (_, i) => ramp(`Filler ${i}`)),
      ];
      const style = [
        { name: "No Synergy", synergy: -0.1 },
        { name: "Core", synergy: 0.8 },
        { name: "Leaning", synergy: 0.2, lean: 0.3 },
        ...Array.from({ length: 13 }, (_, i) => ({ name: `Filler ${i}`, synergy: 0.5 - i / 100 })),
      ];
      const { all } = shelf(build(cards, style, true), "ramp");
      expect(names(all.leaning)).toEqual(["Leaning"]);
      expect(all.leaning[0].reason).toBe("+30% in this playstyle");
      expect(names(all.synergy).slice(0, 2)).toEqual(["Core", "Filler 0"]);
      expect(all.synergy[0].reason).toBe("+80% synergy");
      expect(all.synergy).toHaveLength(14);
      expect(names(all.rest)).toEqual(["No Synergy", "Outside"]);
    });

    it("counts a card that sets it apart toward the plan", () => {
      const quiet = candidate(card("Parallel Lives", "Enchantment", "If an effect would create tokens, it creates twice that many."));
      const plain = candidate(card("Sign in Blood", "Sorcery", "Target player draws two cards."));
      const result = build([quiet, plain], [{ name: "Sign in Blood", synergy: 0.02 }, { name: "Parallel Lives", synergy: 0.02, lean: 0.14 }]);
      expect(names(shelf(result, "plan").leaning)).toEqual(["Parallel Lives"]);
      expect(names(shelf(result, "advantage").synergy)).toEqual(["Sign in Blood"]);
    });

    it("sets aside cards its decks don't play, owned or not, however the commander's decks rate them", () => {
      const cards = [ramp("Style Card", { ownedCopies: 0 }), ramp("Binder Card", { ownedCopies: 2, inclusion: undefined }), ramp("Commander Card", { synergy: 0.9, inclusion: 0.9 })];
      const shelfOf = shelf(build(cards, [{ name: "Style Card", inclusion: 0.2 }], true), "ramp");
      expect(names([...shelfOf.synergy, ...shelfOf.flexible, ...shelfOf.more])).toEqual(["Style Card"]);
      expect(names(shelfOf.outside)).toEqual(["Binder Card", "Commander Card"]);
    });

    it("still puts your own cards first among the ones its decks play", () => {
      const cards = [ramp("Bought", { ownedCopies: 0 }), ramp("Owned", { ownedCopies: 1 })];
      const style = [
        { name: "Bought", synergy: 0.6 },
        { name: "Owned", synergy: 0.3 },
      ];
      expect(names(shelf(build(cards, style, true), "ramp").synergy)).toEqual(["Owned", "Bought"]);
    });

    it("counts a card toward the plan by that playstyle's synergy", () => {
      const cards = [ramp("Core Card", { synergy: 0 }), ramp("Staple", { synergy: 0.5, lists: ["High Synergy Cards"] })];
      const style = [
        { name: "Core Card", synergy: 0.4 },
        { name: "Staple", synergy: 0.02 },
      ];
      expect(names(shelf(build(cards, style), "plan").synergy)).toEqual(["Core Card"]);
    });

    it("ranks lands its decks play ahead of owned lands they don't", () => {
      const land = (name: string, extra: Partial<BuilderCandidate>) => candidate(card(name, "Land", "{T}: Add {B} or {G}.", { colorIdentity: ["B", "G"], cmc: 0 }), extra);
      const result = build([land("Binder Dual", { ownedCopies: 1 }), land("Style Dual", {})], [{ name: "Style Dual", inclusion: 0.5 }], true);
      expect(names(result.lands.duals)).toEqual(["Style Dual", "Binder Dual"]);
    });

    it("has nothing outside it without a playstyle", () => {
      expect(run(3).template.flatMap((g) => g.outside)).toEqual([]);
    });
  });

  describe("withPlaystyle", () => {
    const data = {
      found: true as const,
      url: "https://edhrec.com/commanders/x",
      numDecks: 1000,
      themes: [{ name: "Elves", slug: "elves", numDecks: 400 }],
      bracketCounts: { "3": 900 },
      curveAverage: 3.5,
      cards: [{ name: "Sol Ring", numDecks: 900, lists: ["Top Cards"] }],
      details: { "Sol Ring": card("Sol Ring", "Artifact", "") },
    };
    const style = { found: true as const, url: "https://edhrec.com/commanders/x/elves", numDecks: 400, curveAverage: 2.8, cards: [{ name: "Elvish Mystic", numDecks: 300 }], listed: [], details: {} };

    it("narrows the numbers to its decks and keeps the commander's playstyles", () => {
      const narrowed = withPlaystyle(data, { ...style, bracketCounts: { "2": 300 } });
      expect(narrowed).toMatchObject({ numDecks: 400, curveAverage: 2.8, bracketCounts: { "2": 300 }, url: data.url, themes: data.themes });
      expect(narrowed.cards).toEqual([{ name: "Elvish Mystic", numDecks: 300, lists: [] }]);
      expect(narrowed.details["Sol Ring"]).toBeDefined();
    });

    it("keeps the commander's bracket split when its decks have none", () => {
      expect(withPlaystyle(data, { ...style, bracketCounts: {} }).bracketCounts).toEqual({ "3": 900 });
    });
  });

  describe("lands", () => {
    const land = (name: string, oracleText: string, colorIdentity: string[] = [], extra: Partial<BuilderCandidate> = {}, typeLine = "Land") =>
      candidate(card(name, typeLine, oracleText, { colorIdentity, cmc: 0 }), { inclusion: undefined, ...extra });
    const cemetery = land("Woodland Cemetery", "This land enters tapped unless you control a Swamp or a Forest.\n{T}: Add {B} or {G}.", ["B", "G"], { inclusion: 0.6 });
    const tomb = land("Overgrown Tomb", "({T}: Add {B} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.", ["B", "G"], { inclusion: 0.7 }, "Land — Swamp Forest");
    const bayou = land("Bayou", "({T}: Add {B} or {G}.)", ["B", "G"], {}, "Land — Swamp Forest");
    const catacombs = land("Verdant Catacombs", "{T}, Pay 1 life, Sacrifice this land: Search your library for a Swamp or Forest card, put it onto the battlefield, then shuffle.");
    const strand = land("Flooded Strand", "{T}, Pay 1 life, Sacrifice this land: Search your library for a Plains or Island card, put it onto the battlefield, then shuffle.");
    const wilds = land("Evolving Wilds", "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.");
    const tower = land("Command Tower", "{T}: Add one mana of any color in your commander's color identity.");
    const rogues = land("Rogue's Passage", "{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn.");
    const gate = land("Golgari Guildgate", "This land enters tapped.\n{T}: Add {B} or {G}.", ["B", "G"], { inclusion: 0.9 }, "Land — Gate");
    const all = [bayou, cemetery, tomb, catacombs, strand, wilds, tower, rogues, gate];
    const build = (candidates: BuilderCandidate[], identity = ["B", "G"], extra: { preferOwned?: boolean; perGroup?: number; deck?: BuilderCandidate[] } = {}) =>
      builderRecommendations({
        deck: [{ card: commander, qty: 1 }, ...(extra.deck ?? []).map((c) => ({ card: c.card, qty: 1 }))],
        candidates,
        identity,
        bracket: 3,
        isGameChanger: () => false,
        preferOwned: extra.preferOwned ?? false,
        lands: 38,
        perGroup: extra.perGroup,
      }).lands;

    it("sorts lands into duals, more fixing, utility and tapped lands", () => {
      const lands = build(all);
      expect(names(lands.duals)).toEqual(["Overgrown Tomb", "Woodland Cemetery", "Bayou"]);
      expect(names(lands.fixing)).toEqual(expect.arrayContaining(["Verdant Catacombs", "Evolving Wilds", "Command Tower"]));
      expect(names(lands.utility)).toEqual(["Rogue's Passage"]);
      expect(names(lands.slow)).toEqual(["Golgari Guildgate"]);
    });

    it("leaves out fetch lands that can't find the deck's colors", () => {
      const lands = Object.values(build(all)).flat();
      expect(names(lands)).not.toContain("Flooded Strand");
    });

    it("puts the lands you own ahead when asked", () => {
      const owned = { ...bayou, ownedCopies: 1 };
      expect(names(build([cemetery, tomb, owned], ["B", "G"], { preferOwned: true }).duals)).toEqual(["Bayou", "Overgrown Tomb", "Woodland Cemetery"]);
    });

    it("lists enough duals to fill the mana base and drops the ones in the deck", () => {
      const more = Array.from({ length: 20 }, (_, i) => land(`Dual ${i}`, "{T}: Add {B} or {G}.", ["B", "G"]));
      expect(build(more, ["B", "G"], { perGroup: 2 }).duals).toHaveLength(14);
      expect(build(more, ["B", "G"], { perGroup: 2, deck: more.slice(0, 4) }).duals).toHaveLength(10);
      expect(names(build(all, ["B", "G"], { deck: [tomb] }).duals)).toEqual(["Woodland Cemetery", "Bayou"]);
    });

    it("has no shelf for fixing in one color", () => {
      const lands = build([catacombs, tower, rogues], ["G"]);
      expect(lands.fixing).toEqual([]);
      expect(names(lands.utility)).toEqual(expect.arrayContaining(["Verdant Catacombs", "Rogue's Passage"]));
    });
  });
});
