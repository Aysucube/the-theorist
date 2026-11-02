import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { THREAT_KINDS, threatKind } from "./threats";

const card = (name: string, typeLine: string, oracleText: string, extra: Partial<CardDetails> = {}): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity: [],
  layout: "normal",
  keywords: [],
  cmc: 3,
  ...extra,
});

describe("threats", () => {
  it.each([
    ["alternate", card("Thassa's Oracle", "Creature — Merfolk Wizard", "When this creature enters, look at the top X cards of your library. If X is greater than or equal to the number of cards in your library, you win the game.")],
    ["alternate", card("Triumph of the Hordes", "Sorcery", "Until end of turn, creatures you control get +1/+1 and gain trample and infect.")],
    ["tempo", card("Time Warp", "Sorcery", "Target player takes an extra turn after this one.")],
    ["tempo", card("Aggravated Assault", "Enchantment", "{3}{R}{R}: Untap all creatures you control. After this main phase, there is an additional combat phase followed by an additional main phase.")],
    ["drain", card("Zulaport Cutthroat", "Creature — Human Rogue Ally", "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life.")],
    ["drain", card("Blood Artist", "Creature — Vampire", "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.")],
    ["drain", card("Impact Tremors", "Enchantment", "Whenever a creature you control enters, this enchantment deals 1 damage to each opponent.")],
    ["theft", card("Agent of Treachery", "Creature — Human Rogue", "When this creature enters, gain control of target permanent.")],
    ["theft", card("Mind Control", "Enchantment — Aura", "Enchant creature\nYou control enchanted creature.")],
    ["swarm", card("Hornet Queen", "Creature — Insect", "When this creature enters, create four 1/1 green Insect creature tokens with flying and deathtouch.", { power: "2" })],
    ["swarm", card("Bitterblossom", "Kindred Enchantment — Faerie", "At the beginning of your upkeep, you lose 1 life and create a 1/1 black Faerie Rogue creature token with flying.")],
    ["swarm", card("Avenger of Zendikar", "Creature — Elemental", "When this creature enters, create a 0/1 green Plant creature token for each land you control.")],
    ["overrun", card("Craterhoof Behemoth", "Creature — Beast", "Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.", { power: "5" })],
    ["overrun", card("Glorious Anthem", "Enchantment", "Creatures you control get +1/+1.")],
    ["stax", card("Ghostly Prison", "Enchantment", "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.")],
    ["stax", card("Thalia, Guardian of Thraben", "Legendary Creature — Human Soldier", "First strike\nNoncreature spells cost {1} more to cast.")],
    ["stax", card("Winter Orb", "Artifact", "As long as this artifact is untapped, players can't untap more than one land during their untap steps.")],
    ["attrition", card("Mind Rot", "Sorcery", "Target player discards two cards.")],
    ["attrition", card("Armageddon", "Sorcery", "Destroy all lands.")],
    ["attackers", card("Ghalta, Primal Hunger", "Legendary Creature — Elder Dinosaur", "Trample", { power: "12", keywords: ["Trample"] })],
    ["attackers", card("Serra Angel", "Creature — Angel", "Flying, vigilance", { power: "4", keywords: ["Flying", "Vigilance"] })],
    ["engine", card("Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.")],
    ["engine", card("Doubling Season", "Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.")],
    ["engine", card("Arcanis the Omnipotent", "Legendary Creature — Wizard", "{T}: Draw three cards.", { power: "3" })],
  ])("reads %s", (kind, c) => {
    expect(threatKind(c)).toBe(kind);
  });

  it("keeps planeswalkers together, whatever they do", () => {
    expect(threatKind(card("Vraska, Betrayal's Sting", "Legendary Planeswalker — Vraska", "−9: Each opponent with fewer than nine poison counters gets poison counters."))).toBe("walker");
  });

  it("puts combo pieces first, but never a land", () => {
    expect(threatKind(card("Sol Ring", "Artifact", "{T}: Add {C}{C}."), true)).toBe("combo");
    expect(threatKind(card("Gaea's Cradle", "Legendary Land", "{T}: Add {G} for each creature you control."), true)).toBeUndefined();
  });

  it("leaves out what doesn't threaten anyone", () => {
    const quiet = [
      card("Sol Ring", "Artifact", "{T}: Add {C}{C}."),
      card("Cultivate", "Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle."),
      card("Swords to Plowshares", "Instant", "Exile target creature. Its controller gains life equal to its power."),
      card("Counterspell", "Instant", "Counter target spell."),
      card("Mind Stone", "Artifact", "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."),
      card("Beast Within", "Instant", "Destroy target permanent. Its controller creates a 3/3 green Beast creature token."),
      card("Platinum Angel", "Artifact Creature — Angel", "Flying\nYou can't lose the game.", { power: "4", keywords: ["Flying"] }),
      card("Grizzly Bears", "Creature — Bear", "", { power: "2" }),
    ];
    expect(quiet.filter((c) => threatKind(c) && c.name !== "Platinum Angel")).toEqual([]);
    expect(threatKind(quiet[6])).toBe("attackers");
  });

  it("doesn't take a one-off spell for an engine", () => {
    expect(threatKind(card("Glimpse of Nature", "Sorcery", "Whenever you cast a creature spell this turn, draw a card."))).toBeUndefined();
  });

  it("gives every kind a purpose and a label", () => {
    expect(new Set(THREAT_KINDS.map((k) => k.kind)).size).toBe(THREAT_KINDS.length);
    expect(THREAT_KINDS.every((k) => k.label && k.about)).toBe(true);
  });
});
