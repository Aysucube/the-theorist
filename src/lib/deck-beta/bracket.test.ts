import { describe, expect, it } from "vitest";
import type { CardDetails, Combo, SpellbookBracket } from "@/lib/types";
import { bracketLabel, bracketPath, comboBracket, estimateDeckBracket, isExtraTurn, isMassLandDenial, type BracketInput } from "./bracket";

const card = (name: string, oracleText = "", extra: Partial<CardDetails> = {}): CardDetails => ({
  name,
  typeLine: "Artifact",
  oracleText,
  colorIdentity: [],
  layout: "normal",
  keywords: [],
  cmc: 2,
  ...extra,
});

const combo = (id: string, cards: string[], results: string[], bracketTag?: Combo["bracketTag"], extra: Partial<Combo> = {}): Combo => ({
  id,
  cards,
  templates: [],
  results,
  steps: "",
  prerequisites: "",
  url: "",
  bracketTag,
  ...extra,
});

const GAME_CHANGERS = new Set(["Rhystic Study", "Demonic Tutor", "Smothering Tithe", "Cyclonic Rift", "The One Ring"]);
const isGameChanger = (name: string) => GAME_CHANGERS.has(name);

const base = (cards: CardDetails[], extra: Partial<BracketInput> = {}) =>
  estimateDeckBracket({ cards, isGameChanger, combos: { included: [], almostIncluded: [] }, tutors: 0, ...extra });

const elves = [card("Lathril, Blade of the Elves"), card("Elvish Archdruid"), card("Priest of Titania"), card("Sol Ring")];

describe("isMassLandDenial and isExtraTurn", () => {
  it("spots land denial in its usual forms", () => {
    expect(isMassLandDenial(card("Armageddon", "Destroy all lands."))).toBe(true);
    expect(isMassLandDenial(card("Jokulhaups", "Destroy all artifacts, creatures, and lands. They can't be regenerated."))).toBe(true);
    expect(isMassLandDenial(card("Winter Orb", "As long as Winter Orb is untapped, players can't untap more than one land during their untap steps."))).toBe(true);
    expect(isMassLandDenial(card("Blood Moon", "Nonbasic lands are Mountains."))).toBe(true);
    expect(isMassLandDenial(card("Back to Basics", "Nonbasic lands don't untap during their controllers' untap steps."))).toBe(true);
  });

  it("leaves ordinary land cards and one-land removal alone", () => {
    expect(isMassLandDenial(card("Strip Mine", "{T}: Add {C}.\n{T}, Sacrifice Strip Mine: Destroy target land."))).toBe(false);
    expect(isMassLandDenial(card("Wrath of God", "Destroy all creatures. They can't be regenerated."))).toBe(false);
    expect(isMassLandDenial(card("Cultivate", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle."))).toBe(false);
  });

  it("spots extra turns, but not cards that stop them", () => {
    expect(isExtraTurn(card("Time Warp", "Target player takes an extra turn after this one."))).toBe(true);
    expect(isExtraTurn(card("Time Stretch", "Target player takes two extra turns after this one."))).toBe(true);
    expect(isExtraTurn(card("Stranglehold", "Your opponents can't search libraries.\nIf an opponent would begin an extra turn, that player skips that turn instead."))).toBe(false);
  });
});

describe("comboBracket", () => {
  it("follows Commander Spellbook's tag", () => {
    expect(comboBracket(combo("a", ["Thassa's Oracle", "Demonic Consultation"], ["Win the game"], "R"))).toBe(4);
    expect(comboBracket(combo("b", ["Staff of Domination", "Priest of Titania", "Elvish Archdruid"], ["Infinite card draw"], "S"))).toBe(3);
  });

  it("puts a two-card infinite in Bracket 3 at least, whatever its tag", () => {
    expect(comboBracket(combo("c", ["Umbral Mantle", "Priest of Titania"], ["Infinite green mana"], "O"))).toBe(3);
    expect(comboBracket(combo("d", ["A", "B", "C"], ["Infinite green mana"], "O"))).toBe(2);
  });
});

describe("estimateDeckBracket", () => {
  it("calls a deck with nothing limited Bracket 2", () => {
    const report = base(elves);
    expect(report.bracket).toBe(2);
    expect(report.nearing).toBeUndefined();
    expect(bracketLabel(report)).toBe("Bracket 2");
  });

  it("counts Game Changers: one to three is Bracket 3, four or more is 4", () => {
    expect(base([...elves, card("Rhystic Study")]).bracket).toBe(3);
    const four = base([...elves, card("Rhystic Study"), card("Demonic Tutor"), card("Smothering Tithe"), card("Cyclonic Rift")]);
    expect(four.bracket).toBe(4);
    expect(four.reasons[0].text).toMatch(/4 Game Changers/);
  });

  it("puts mass land denial and chained extra turns in Bracket 4", () => {
    expect(base([...elves, card("Armageddon", "Destroy all lands.")]).bracket).toBe(4);
    const turns = ["Time Warp", "Temporal Manipulation", "Capture of Jingzhou"].map((n) => card(n, "Target player takes an extra turn after this one."));
    expect(base([...elves, ...turns]).bracket).toBe(4);
    // One or two extra-turn cards are fine in Bracket 2 if they aren't chained.
    expect(base([...elves, turns[0]]).bracket).toBe(2);
  });

  it("rates the deck by its strongest combo", () => {
    const fast = combo("thoracle", ["Thassa's Oracle", "Demonic Consultation"], ["Win the game"], "R");
    const report = base([...elves, card("Thassa's Oracle"), card("Demonic Consultation")], { combos: { included: [fast], almostIncluded: [] } });
    expect(report.bracket).toBe(4);
    expect(report.combos[0].combo.id).toBe("thoracle");
    expect(report.reasons.some((r) => r.text.includes("Thassa's Oracle + Demonic Consultation"))).toBe(true);
  });

  it("uses Commander Spellbook's flags and its estimate when it's higher", () => {
    const spellbook: SpellbookBracket = { tag: "S", gameChangers: [], massLandDenial: [], extraTurns: [], twoCard: [], locks: [] };
    const report = base(elves, { spellbook });
    expect(report.bracket).toBe(3);
    expect(report.spellbook).toBe(3);
  });

  it("says when a deck is nearing the next bracket", () => {
    // At Bracket 3's Game Changer limit.
    const capped = base([...elves, card("Rhystic Study"), card("Demonic Tutor"), card("Smothering Tithe")]);
    expect(bracketLabel(capped)).toBe("Bracket 3 nearing 4");
    expect(capped.nearingReasons).toContain("At Bracket 3's limit of 3 Game Changers.");

    // One card from three different combos above Bracket 2.
    const almost = ["Staff of Domination", "Umbral Mantle", "Sword of the Paruns"].map((missing, i) =>
      combo(`almost-${i}`, [missing, "Priest of Titania"], ["Infinite green mana"], "S"),
    );
    const close = base(elves, { combos: { included: [], almostIncluded: almost } });
    expect(bracketLabel(close)).toBe("Bracket 2 nearing 3");
    expect(close.almost.map((a) => a.missing)).toEqual(["Staff of Domination", "Umbral Mantle", "Sword of the Paruns"]);
  });

  it("needs two small signs to call a deck nearing", () => {
    const oneCombo = [combo("x", ["Staff of Domination", "Priest of Titania"], ["Infinite card draw"], "S")];
    expect(base(elves, { combos: { included: [], almostIncluded: oneCombo } }).nearing).toBeUndefined();
    expect(base(elves, { combos: { included: [], almostIncluded: oneCombo }, tutors: 5 }).nearing).toBe(3);
  });
});

describe("bracketPath", () => {
  const strong = [
    ...elves,
    card("Rhystic Study"),
    card("Demonic Tutor"),
    card("Smothering Tithe"),
    card("Cyclonic Rift"),
    card("Armageddon", "Destroy all lands."),
    card("Thassa's Oracle"),
    card("Demonic Consultation"),
  ];
  const fast = combo("thoracle", ["Thassa's Oracle", "Demonic Consultation"], ["Win the game"], "R");
  const report = base(strong, { combos: { included: [fast], almostIncluded: [] } });

  it("lists what to cut to come down to Bracket 3", () => {
    const path = bracketPath(report, 3, "Lathril, Blade of the Elves");
    const why = path.cuts.map((c) => c.why);
    expect(path.cuts.find((c) => c.why.startsWith("Game Changers"))).toMatchObject({ cut: 1, cards: ["Cyclonic Rift", "Demonic Tutor", "Rhystic Study", "Smothering Tithe"] });
    expect(why.some((w) => w.startsWith("Mass land denial"))).toBe(true);
    expect(path.cuts.find((c) => c.why.includes("Thassa's Oracle"))?.cards).toEqual(["Thassa's Oracle", "Demonic Consultation"]);
    expect(path.gameChangerRoom).toBe(0);
  });

  it("points out a piece shared by several combos, which breaks them all", () => {
    const mantle = [
      combo("m1", ["Umbral Mantle", "Priest of Titania"], ["Infinite green mana"], "S"),
      combo("m2", ["Umbral Mantle", "Elvish Archdruid"], ["Infinite green mana"], "S"),
    ];
    const elvesWithMantle = base([...elves, card("Umbral Mantle")], { combos: { included: mantle, almostIncluded: [] } });
    const cuts = bracketPath(elvesWithMantle, 2).cuts;
    expect(cuts[0]).toMatchObject({ why: "Cutting Umbral Mantle breaks 2 of the combos below at once.", cards: ["Umbral Mantle"] });
    expect(cuts).toHaveLength(3);
  });

  it("separates names that have commas in them with semicolons", () => {
    const report = base([...elves, card("Tergrid, God of Fright"), card("Rhystic Study")], { isGameChanger: (n) => n.startsWith("Tergrid") || n === "Rhystic Study" });
    expect(report.reasons[0].text).toContain("(Rhystic Study; Tergrid, God of Fright)");
  });

  it("cuts every Game Changer for Bracket 2", () => {
    expect(bracketPath(report, 2).cuts[0]).toMatchObject({ cut: 4 });
  });

  it("has nothing to cut going up, and says how much room there is", () => {
    const small = base([...elves, card("Rhystic Study")]);
    const path = bracketPath(small, 3);
    expect(path.cuts).toEqual([]);
    expect(path.gameChangerRoom).toBe(2);
    expect(bracketPath(small, 4).gameChangerRoom).toBe(Infinity);
  });
});
