import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { cardRoles, deckProfile, quadrantGaps, quadrantsOf, roleGaps } from "./roles";

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
  solRing: card("Sol Ring", "Artifact", "{T}: Add {C}{C}."),
  llanowar: card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", { power: "1", toughness: "1" }),
  cultivate: card("Cultivate", "Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle."),
  rhystic: card("Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}."),
  demonic: card("Demonic Tutor", "Sorcery", "Search your library for a card, put that card into your hand, then shuffle."),
  swords: card("Swords to Plowshares", "Instant", "Exile target creature. Its controller gains life equal to its power."),
  wrath: card("Wrath of God", "Sorcery", "Destroy all creatures. They can't be regenerated."),
  deluge: card("Toxic Deluge", "Sorcery", "As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn."),
  massacre: card("Massacre Wurm", "Creature — Phyrexian Wurm", "When Massacre Wurm enters, creatures your opponents control get -2/-2 until end of turn.\nWhenever a creature an opponent controls dies, that player loses 2 life.", { power: "6", toughness: "5" }),
  counterspell: card("Counterspell", "Instant", "Counter target spell."),
  boots: card("Swiftfoot Boots", "Artifact — Equipment", "Equipped creature has hexproof and haste.\nEquip {1}"),
  heroic: card("Heroic Intervention", "Instant", "Permanents you control gain hexproof and indestructible until end of turn."),
  craterhoof: card("Craterhoof Behemoth", "Creature — Beast", "Haste\nWhen Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.", { power: "5", toughness: "5" }),
  archdruid: card("Elvish Archdruid", "Creature — Elf Druid", "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.", { power: "2", toughness: "2" }),
  zulaport: card("Zulaport Cutthroat", "Creature — Human Rogue Ally", "Whenever Zulaport Cutthroat or another creature you control dies, each opponent loses 1 life and you gain 1 life.", { power: "1", toughness: "1" }),
  forest: card("Forest", "Basic Land — Forest", "({T}: Add {G}.)"),
  doubling: card("Doubling Season", "Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."),
};

describe("cardRoles", () => {
  it("finds the Developing jobs: ramp, card draw, tutors", () => {
    expect([...cardRoles(cards.solRing)]).toEqual(["ramp"]);
    expect([...cardRoles(cards.llanowar)]).toEqual(["ramp"]);
    expect([...cardRoles(cards.cultivate)]).toEqual(["ramp"]);
    expect([...cardRoles(cards.rhystic)]).toEqual(["draw"]);
    expect([...cardRoles(cards.demonic)]).toEqual(["tutor"]);
  });

  it("finds the Behind jobs: removal, board wipes, lifegain, big creatures", () => {
    expect([...cardRoles(cards.swords)]).toEqual(["removal"]);
    expect([...cardRoles(cards.wrath)]).toEqual(["wipe"]);
    expect([...cardRoles(cards.deluge)]).toEqual(["wipe"]);
    // Auras that shut a creature down count; exiling cards from graveyards doesn't.
    const lignify = card("Lignify", "Tribal Enchantment — Treefolk Aura", "Enchant creature\nEnchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities.");
    const pacifism = card("Pacifism", "Enchantment — Aura", "Enchant creature\nEnchanted creature can't attack or block.");
    expect([...cardRoles(lignify)]).toEqual(["removal"]);
    expect([...cardRoles(pacifism)]).toEqual(["removal"]);
    const deathrite = card(
      "Deathrite Shaman",
      "Creature — Elf Shaman",
      "{T}: Exile target land card from a graveyard. Add one mana of any color.\n{B}, {T}: Exile target instant or sorcery card from a graveyard. Each opponent loses 2 life.\n{G}, {T}: Exile target creature card from a graveyard. You gain 2 life.",
      { power: "1", toughness: "2" },
    );
    expect(cardRoles(deathrite).has("removal")).toBe(false);
    expect(cardRoles(deathrite).has("ramp")).toBe(true);
  });

  it("finds the Parity jobs: one-sided wipes, anthems, evasion", () => {
    expect([...cardRoles(cards.massacre)]).toEqual(expect.arrayContaining(["onesidedwipe", "bigbody"]));
    expect([...cardRoles(cards.craterhoof)]).toEqual(expect.arrayContaining(["anthem", "evasion"]));
  });

  it("finds the Ahead jobs: counterspells, protection, finishers", () => {
    expect([...cardRoles(cards.counterspell)]).toEqual(["counter"]);
    expect([...cardRoles(cards.boots)]).toEqual(["protection"]);
    expect([...cardRoles(cards.heroic)]).toEqual(["protection"]);
    expect(cardRoles(cards.zulaport).has("finisher")).toBe(true);
  });

  it("gives flexible cards several quadrants, and lands none", () => {
    expect([...quadrantsOf(cardRoles(cards.archdruid))].sort()).toEqual(["developing", "parity"]);
    expect([...quadrantsOf(cardRoles(cards.zulaport))].sort()).toEqual(["ahead", "behind"]);
    expect(cardRoles(cards.forest).size).toBe(0);
    expect(cardRoles(cards.doubling).size).toBe(0);
  });
});

describe("deckProfile", () => {
  const profile = deckProfile(
    [
      { card: cards.solRing, qty: 1 },
      { card: cards.archdruid, qty: 1 },
      { card: cards.swords, qty: 1 },
      { card: cards.doubling, qty: 1 },
      { card: cards.forest, qty: 30 },
    ],
    ["G", "W"],
  );

  it("counts each job and quadrant, the flexible cards, and lands", () => {
    expect(profile.roles.ramp).toEqual(["Sol Ring", "Elvish Archdruid"]);
    expect(profile.quadrants.parity).toEqual(["Elvish Archdruid"]);
    expect(profile.flexible).toEqual(["Elvish Archdruid"]);
    expect(profile.noQuadrant).toEqual(["Doubling Season"]);
    expect(profile.lands).toBe(30);
  });

  it("says how many more of each job the deck could use", () => {
    expect(roleGaps(profile)).toMatchObject({ ramp: 8, draw: 10, removal: 7, wipe: 2, protection: 3 });
    expect(roleGaps(profile).counter).toBeUndefined(); // no blue
    expect(quadrantGaps(profile).developing).toBe(20);
  });
});
