import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { planUpgrades, scoreCandidate } from "./doctor";
import { deckProfile, quadrantGaps, roleGaps } from "./roles";

const card = (name: string, typeLine: string, oracleText: string, extra: Partial<CardDetails> = {}): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity: ["G"],
  layout: "normal",
  keywords: [],
  cmc: 0,
  ...extra,
});

const deck = deckProfile(
  [
    { card: card("Sol Ring", "Artifact", "{T}: Add {C}{C}."), qty: 1 },
    { card: card("Forest", "Basic Land — Forest", ""), qty: 35 },
  ],
  ["G"],
);
const roles = roleGaps(deck);
const quadrants = quadrantGaps(deck);

const candidates = [
  { card: card("Arcane Signet", "Artifact", "{T}: Add one mana of any color in your commander's color identity."), inclusion: 0.9 },
  { card: card("Harmonize", "Sorcery", "Draw three cards."), inclusion: 0.5, synergy: 0.1 },
  { card: card("Worldly Tutor", "Instant", "Search your library for a creature card, reveal it, then shuffle and put the card on top."), inclusion: 0.3 },
  { card: card("Beast Within", "Instant", "Destroy target permanent. Its controller creates a 3/3 green Beast creature token."), inclusion: 0.6 },
  {
    card: card("Elvish Archdruid", "Creature — Elf Druid", "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.", { power: "2", toughness: "2" }),
    inclusion: 0.5,
    synergy: 0.6,
  },
  { card: card("Heroic Intervention", "Instant", "Permanents you control gain hexproof and indestructible until end of turn."), inclusion: 0.4 },
  { card: card("Gaea's Cradle", "Legendary Land", "{T}: Add {G} for each creature you control."), inclusion: 0.8 },
  { card: card("Doubling Season", "Enchantment", "If an effect would create one or more tokens, it creates twice that many instead."), inclusion: 0.7 },
  { card: card("Sol Ring", "Artifact", "{T}: Add {C}{C}."), inclusion: 0.95 },
];

describe("scoreCandidate", () => {
  it("favours cards that fit several quadrants and fill a gap", () => {
    const archdruid = scoreCandidate(candidates[4], roles);
    expect(archdruid.quadrants.sort()).toEqual(["developing", "parity"]);
    const plainer = scoreCandidate({ ...candidates[4], card: card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.") }, roles);
    expect(archdruid.score).toBeGreaterThan(plainer.score);
  });
});

describe("planUpgrades", () => {
  const plan = planUpgrades(deck, roles, quadrants, candidates, (n) => n === "Sol Ring");

  it("offers card draw and tutors for consistency, and ramp", () => {
    expect(plan.consistency.map((p) => p.card.name)).toEqual(["Harmonize", "Worldly Tutor"]);
    // The Archdruid outranks the Signet: more synergy, and it fits two quadrants.
    expect(plan.ramp.map((p) => p.card.name)).toEqual(["Elvish Archdruid", "Arcane Signet"]);
  });

  it("fills the quadrants the deck is short in, and skips lands, cards it has, and cards with no job", () => {
    const offered = plan.quadrants.flatMap((g) => g.picks.map((p) => p.card.name));
    expect(offered).toEqual(expect.arrayContaining(["Beast Within", "Heroic Intervention"]));
    const everything = [...plan.consistency, ...plan.ramp, ...plan.quadrants.flatMap((g) => g.picks)].map((p) => p.card.name);
    expect(everything).not.toContain("Gaea's Cradle");
    expect(everything).not.toContain("Sol Ring");
    expect(everything).not.toContain("Doubling Season");
    // Each card is offered once.
    expect(new Set(everything).size).toBe(everything.length);
  });
});
