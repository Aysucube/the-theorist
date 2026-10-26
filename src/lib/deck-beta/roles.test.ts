import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { cardRoles, categoriesOf, categoryGaps, deckProfile } from "./roles";

const card = (name: string, typeLine: string, oracleText: string, extra: Partial<CardDetails> = {}): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity: [],
  layout: "normal",
  keywords: [],
  cmc: 0,
  ...extra,
});

// Rules text as Scryfall has it.
const cards = {
  solRing: card("Sol Ring", "Artifact", "{T}: Add {C}{C}.", { cmc: 1 }),
  llanowar: card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", { power: "1", toughness: "1", cmc: 1 }),
  cultivate: card("Cultivate", "Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.", { cmc: 3 }),
  rhystic: card("Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.", { cmc: 3 }),
  harmonize: card("Harmonize", "Sorcery", "Draw three cards.", { cmc: 4 }),
  ponder: card("Ponder", "Sorcery", "Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.", { cmc: 1 }),
  visionary: card("Elvish Visionary", "Creature — Elf Shaman", "When this creature enters, draw a card.", { cmc: 2 }),
  archivist: card("Archivist", "Creature — Human Wizard", "{T}: Draw a card.", { cmc: 4 }),
  demonic: card("Demonic Tutor", "Sorcery", "Search your library for a card, put that card into your hand, then shuffle.", { cmc: 2 }),
  swords: card("Swords to Plowshares", "Instant", "Exile target creature. Its controller gains life equal to its power.", { cmc: 1 }),
  counterspell: card("Counterspell", "Instant", "Counter target spell.", { cmc: 2 }),
  wrath: card("Wrath of God", "Sorcery", "Destroy all creatures. They can't be regenerated.", { cmc: 4 }),
  massacre: card("Massacre Wurm", "Creature — Phyrexian Wurm", "When Massacre Wurm enters, creatures your opponents control get -2/-2 until end of turn.\nWhenever a creature an opponent controls dies, that player loses 2 life.", { cmc: 6 }),
  fog: card("Holy Day", "Instant", "Prevent all combat damage that would be dealt this turn.", { cmc: 1 }),
  propaganda: card("Propaganda", "Enchantment", "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.", { cmc: 3 }),
  boots: card("Swiftfoot Boots", "Artifact — Equipment", "Equipped creature has hexproof and haste.\nEquip {1}", { cmc: 2 }),
  zulaport: card("Zulaport Cutthroat", "Creature — Human Rogue Ally", "Whenever Zulaport Cutthroat or another creature you control dies, each opponent loses 1 life and you gain 1 life.", { cmc: 2 }),
  doubling: card("Doubling Season", "Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.", { cmc: 5 }),
  archdruid: card("Elvish Archdruid", "Creature — Elf Druid", "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.", { cmc: 2 }),
  forest: card("Forest", "Basic Land — Forest", "({T}: Add {G}.)"),
};

describe("cardRoles", () => {
  it("finds ramp", () => {
    expect([...cardRoles(cards.solRing)]).toEqual(["ramp"]);
    expect([...cardRoles(cards.llanowar)]).toEqual(["ramp"]);
    expect([...cardRoles(cards.cultivate)]).toEqual(["ramp"]);
  });

  it("counts card advantage that nets cards, not selection", () => {
    expect(cardRoles(cards.rhystic).has("draw")).toBe(true); // again and again
    expect(cardRoles(cards.harmonize).has("draw")).toBe(true); // three at once
    expect(cardRoles(cards.visionary).has("draw")).toBe(true); // a body and a card
    expect(cardRoles(cards.archivist).has("draw")).toBe(true); // an engine
    expect(cardRoles(cards.ponder).has("draw")).toBe(false); // looks, then replaces itself
  });

  it("finds targeted and mass disruption", () => {
    expect([...cardRoles(cards.swords)]).toEqual(["removal"]);
    expect([...cardRoles(cards.counterspell)]).toEqual(["counter"]);
    expect([...cardRoles(cards.wrath)]).toEqual(["wipe"]);
    expect(cardRoles(cards.massacre).has("onesidedwipe")).toBe(true);
    expect([...cardRoles(cards.fog)]).toEqual(["fog"]);
    expect([...cardRoles(cards.propaganda)]).toEqual(["tax"]);
  });

  it("finds tutors, protection, finishers and enhancers, and gives lands nothing", () => {
    expect([...cardRoles(cards.demonic)]).toEqual(["tutor"]);
    expect([...cardRoles(cards.boots)]).toEqual(["protection"]);
    expect(cardRoles(cards.zulaport).has("finisher")).toBe(true);
    expect([...cardRoles(cards.doubling)]).toEqual(["enhancer"]);
    expect(cardRoles(cards.forest).size).toBe(0);
  });
});

describe("categoriesOf", () => {
  it("maps jobs to the template, finishers and enhancers to the plan", () => {
    expect(categoriesOf(cardRoles(cards.swords))).toEqual(["targeted"]);
    expect(categoriesOf(cardRoles(cards.counterspell))).toEqual(["targeted"]);
    expect(categoriesOf(cardRoles(cards.propaganda))).toEqual(["mass"]);
    expect(categoriesOf(cardRoles(cards.doubling))).toEqual(["plan"]);
    expect(categoriesOf(cardRoles(cards.zulaport))).toEqual(["plan"]);
    // Tutors and protection aren't template categories.
    expect(categoriesOf(cardRoles(cards.demonic))).toEqual([]);
  });

  it("makes a card flexible when it fills two or more", () => {
    // The Archdruid ramps, and with an Elf deck it's part of the plan too.
    expect(categoriesOf(cardRoles(cards.archdruid), true)).toEqual(["ramp", "plan"]);
    expect(categoriesOf(cardRoles(cards.visionary), true)).toEqual(["advantage", "plan"]);
    expect(categoriesOf(cardRoles(cards.massacre))).toEqual(["mass"]);
  });
});

describe("deckProfile", () => {
  const profile = deckProfile(
    [
      { card: cards.solRing, qty: 1 },
      { card: cards.archdruid, qty: 1 },
      { card: cards.swords, qty: 1 },
      { card: cards.ponder, qty: 1 },
      { card: cards.forest, qty: 30 },
    ],
    { isPlan: (name) => name === "Elvish Archdruid" },
  );

  it("counts each category, the flexible cards, the unplaced ones and lands", () => {
    expect(profile.categories.ramp).toEqual(["Sol Ring", "Elvish Archdruid"]);
    expect(profile.categories.targeted).toEqual(["Swords to Plowshares"]);
    expect(profile.flexible).toEqual([{ name: "Elvish Archdruid", categories: ["ramp", "plan"] }]);
    expect(profile.unplaced).toEqual(["Ponder"]);
    expect(profile.lands).toBe(30);
    expect(profile.curve.spells).toBe(4);
  });

  it("says how many more of each category the template wants", () => {
    expect(categoryGaps(profile)).toEqual({ ramp: 8, advantage: 12, targeted: 11, mass: 6, plan: 29 });
  });
});
