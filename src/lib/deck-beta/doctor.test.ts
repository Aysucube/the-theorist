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

const everything = (plan: ReturnType<typeof planUpgrades>) =>
  [...plan.flexible, ...plan.consistency, ...plan.ramp, ...plan.quadrants.flatMap((g) => g.picks), ...plan.power].map((p) => p.card.name);

describe("planUpgrades", () => {
  const plan = planUpgrades(deck, roles, quadrants, candidates, (n) => n === "Sol Ring");

  it("offers flexible cards first, then card draw and tutors for consistency, and ramp", () => {
    // The Archdruid ramps and pumps Elves: Developing and Parity.
    expect(plan.flexible.map((p) => p.card.name)).toEqual(["Elvish Archdruid"]);
    expect(plan.consistency.map((p) => p.card.name)).toEqual(["Harmonize", "Worldly Tutor"]);
    expect(plan.ramp.map((p) => p.card.name)).toEqual(["Arcane Signet"]);
  });

  it("fills the quadrants the deck is short in, and skips lands, cards it has, and cards with no job", () => {
    const offered = plan.quadrants.flatMap((g) => g.picks.map((p) => p.card.name));
    expect(offered).toEqual(expect.arrayContaining(["Beast Within", "Heroic Intervention"]));
    expect(everything(plan)).not.toContain("Gaea's Cradle");
    expect(everything(plan)).not.toContain("Sol Ring");
    expect(everything(plan)).not.toContain("Doubling Season");
    // Each card is offered once.
    expect(new Set(everything(plan)).size).toBe(everything(plan).length);
  });
});

describe("planUpgrades for a bracket", () => {
  const gameChangers = new Set(["Smothering Tithe", "Demonic Tutor", "Rhystic Study"]);
  const strong = [
    ...candidates,
    { card: card("Smothering Tithe", "Enchantment", "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token."), inclusion: 0.6 },
    { card: card("Demonic Tutor", "Sorcery", "Search your library for a card, put that card into your hand, then shuffle.", { cmc: 2 }), inclusion: 0.4 },
    { card: card("Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}."), inclusion: 0.5 },
    { card: card("Jokulhaups", "Sorcery", "Destroy all artifacts, creatures, and lands. They can't be regenerated."), inclusion: 0.2 },
    { card: card("Staff of Domination", "Artifact", "{3}, {T}: Untap target creature.\n{5}, {T}: Draw a card."), inclusion: 0.3 },
  ];
  const plan = (bracket: 1 | 2 | 3 | 4 | 5, inDeckGameChangers = 0) =>
    planUpgrades(deck, roles, quadrants, strong, (n) => n === "Sol Ring", {
      bracket,
      isGameChanger: (n) => gameChangers.has(n),
      gameChangersInDeck: inDeckGameChangers,
      completes: (n) => (n === "Staff of Domination" ? 3 : undefined),
    });

  it("leaves out Game Changers, land denial and stronger combos for Bracket 2", () => {
    const p = plan(2);
    expect(everything(p)).not.toEqual(expect.arrayContaining(["Smothering Tithe"]));
    expect(everything(p).some((n) => gameChangers.has(n) || n === "Jokulhaups" || n === "Staff of Domination")).toBe(false);
    const why = Object.fromEntries(p.leftOut.map((l) => [l.pick.card.name, l.why]));
    expect(why["Smothering Tithe"]).toMatch(/Game Changer/);
    expect(why["Jokulhaups"]).toMatch(/land denial/);
    expect(why["Staff of Domination"]).toMatch(/Bracket 3 combo/);
  });

  it("offers only as many Game Changers as Bracket 3 has room for", () => {
    const p = plan(3, 2);
    expect(p.power.filter((x) => x.gameChanger)).toHaveLength(1);
    expect(everything(p).filter((n) => gameChangers.has(n))).toHaveLength(1);
    expect(p.leftOut.filter((l) => l.pick.gameChanger)).toHaveLength(2);
    // Staff completes a Bracket 3 combo, which Bracket 3 allows.
    expect(everything(p)).toContain("Staff of Domination");
  });

  it("ranks strong cards up for Bracket 4 and leaves nothing out", () => {
    const p = plan(4);
    expect(p.leftOut).toEqual([]);
    expect(everything(p)).toEqual(expect.arrayContaining(["Smothering Tithe", "Demonic Tutor", "Rhystic Study", "Jokulhaups"]));
    const four = scoreCandidate(strong.find((c) => c.card.name === "Demonic Tutor")!, roles, { bracket: 4, isGameChanger: (n) => gameChangers.has(n) });
    const two = scoreCandidate(strong.find((c) => c.card.name === "Demonic Tutor")!, roles, { bracket: 2, isGameChanger: (n) => gameChangers.has(n) });
    expect(four.score).toBeGreaterThan(two.score);
  });

  it("ranks cards EDHREC has never seen with the commander lower", () => {
    const tithe = strong.find((c) => c.card.name === "Smothering Tithe")!;
    const seen = scoreCandidate({ ...tithe, inclusion: 0 }, roles, { bracket: 4 });
    const unseen = scoreCandidate({ card: tithe.card }, roles, { bracket: 4 });
    expect(unseen.score).toBeLessThan(seen.score);
  });

  it("weighs flexibility more in lower brackets", () => {
    const archdruid = candidates[4];
    const plain = { ...archdruid, card: card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.") };
    const gap = (b: 1 | 4) => scoreCandidate(archdruid, roles, { bracket: b }).score - scoreCandidate(plain, roles, { bracket: b }).score;
    expect(gap(1)).toBeGreaterThan(gap(4));
  });
});
