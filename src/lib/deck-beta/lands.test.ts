import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { isSlowRamp, landFit, landKind, manaBase, manaBasePlan } from "./lands";
import { cardRoles } from "./roles";

const land = (name: string, typeLine: string, oracleText: string): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity: [],
  layout: "normal",
  keywords: [],
  cmc: 0,
});

// Oracle text as Scryfall has it.
const lands = {
  forest: land("Forest", "Basic Land — Forest", "({T}: Add {G}.)"),
  tropical: land("Tropical Island", "Land — Forest Island", "({T}: Add {G} or {U}.)"),
  breeding: land("Breeding Pool", "Land — Forest Island", "({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped."),
  hinterland: land("Hinterland Harbor", "Land", "This land enters tapped unless you control a Forest or an Island.\n{T}: Add {G} or {U}."),
  promenade: land("Bountiful Promenade", "Land", "This land enters tapped unless you have two or more opponents.\n{T}: Add {G} or {W}."),
  yavimaya: land("Yavimaya Coast", "Land", "{T}: Add {C}.\n{T}: Add {G} or {U}. This land deals 1 damage to you."),
  misty: land("Misty Rainforest", "Land", "{T}, Pay 1 life, Sacrifice this land: Search your library for a Forest or Island card, put it onto the battlefield, then shuffle."),
  passage: land("Fabled Passage", "Land", "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land."),
  ketria: land("Ketria Triome", "Land — Forest Island Mountain", "({T}: Add {G}, {U}, or {R}.)\nThis land enters tapped.\nCycling {3} ({3}, Discard this card: Draw a card.)"),
  tower: land("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity."),
  chamber: land("Simic Growth Chamber", "Land", "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {G}{U}."),
  guildgate: land("Simic Guildgate", "Land — Gate", "This land enters tapped.\n{T}: Add {G} or {U}."),
  passageRogue: land("Rogue's Passage", "Land", "{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn."),
  reliquary: land("Reliquary Tower", "Land", "You have no maximum hand size.\n{T}: Add {C}."),
};

describe("landKind", () => {
  it("tells the kinds of land apart", () => {
    expect(landKind(lands.forest)).toBe("basic");
    for (const dual of [lands.tropical, lands.breeding, lands.hinterland, lands.promenade, lands.yavimaya]) expect(landKind(dual)).toBe("dual");
    expect(landKind(lands.misty)).toBe("fetch");
    expect(landKind(lands.passage)).toBe("fetch");
    expect(landKind(lands.ketria)).toBe("triome");
    expect(landKind(lands.tower)).toBe("rainbow");
    expect(landKind(lands.chamber)).toBe("bounce");
    expect(landKind(lands.guildgate)).toBe("tapped");
    expect(landKind(lands.passageRogue)).toBe("utility");
    expect(landKind(lands.reliquary)).toBe("utility");
  });

  it("isn't for nonlands", () => {
    expect(landKind({ ...lands.forest, typeLine: "Artifact" })).toBeUndefined();
  });
});

describe("mana base by color count", () => {
  it("wants mostly basics in one color and more fixing in more colors", () => {
    expect(manaBasePlan(1, 38)).toMatchObject({ basics: 28, nonbasics: 10, utilityRoom: 9 });
    expect(manaBasePlan(2, 38).nonbasics).toBe(14);
    expect(manaBasePlan(3, 38).nonbasics).toBe(18);
    expect(manaBasePlan(5, 38).nonbasics).toBe(23);
  });

  it("rates fixing up in more colors, utility up in fewer, and tapped lands down", () => {
    expect(landFit("dual", 2)).toBeGreaterThan(landFit("tapped", 2));
    expect(landFit("triome", 3)).toBeGreaterThan(landFit("triome", 2));
    expect(landFit("utility", 1)).toBeGreaterThan(landFit("utility", 4));
    expect(landFit("tapped", 3)).toBeLessThan(0);
  });

  it("counts a deck's basics, nonbasics and kinds", () => {
    const report = manaBase(
      [
        { card: lands.forest, qty: 20 },
        { card: lands.breeding, qty: 1 },
        { card: lands.guildgate, qty: 1 },
        { card: lands.reliquary, qty: 1 },
      ],
      2,
      38,
    );
    expect(report.basics).toBe(20);
    expect(report.nonbasics).toBe(3);
    expect(report.kinds.tapped).toEqual(["Simic Guildgate"]);
    expect(report.utility).toBe(1);
  });
});

describe("isSlowRamp", () => {
  const rock = (name: string, cmc: number): CardDetails => ({ ...lands.forest, name, typeLine: "Artifact", oracleText: "{T}: Add one mana of any color.", cmc });
  it("marks mana rocks of three or more as slow, not two-mana ones", () => {
    expect(isSlowRamp(rock("Manalith", 3), cardRoles(rock("Manalith", 3)))).toBe(true);
    expect(isSlowRamp(rock("Arcane Signet", 2), cardRoles(rock("Arcane Signet", 2)))).toBe(false);
  });
});
