import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { curveCuts, planUpgrades, scoreCandidate } from "./doctor";
import { categoryGaps, deckProfile } from "./roles";

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

const deck = deckProfile([
  { card: card("Sol Ring", "Artifact", "{T}: Add {C}{C}.", { cmc: 1 }), qty: 1 },
  { card: card("Forest", "Basic Land — Forest", "", { cmc: 0 }), qty: 35 },
]);
const gaps = categoryGaps(deck);

const candidates = [
  { card: card("Arcane Signet", "Artifact", "{T}: Add one mana of any color in your commander's color identity."), inclusion: 0.9 },
  { card: card("Harmonize", "Sorcery", "Draw three cards.", { cmc: 4 }), inclusion: 0.5, synergy: 0.1 },
  { card: card("Skullclamp", "Artifact — Equipment", "Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}", { cmc: 1 }), inclusion: 0.4 },
  { card: card("Beast Within", "Instant", "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.", { cmc: 3 }), inclusion: 0.6 },
  {
    card: card("Elvish Archdruid", "Creature — Elf Druid", "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.", { power: "2", toughness: "2" }),
    inclusion: 0.5,
    synergy: 0.6,
  },
  { card: card("Explosive Vegetation", "Sorcery", "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.", { cmc: 4 }), inclusion: 0.5 },
  { card: card("Gaea's Cradle", "Legendary Land", "{T}: Add {G} for each creature you control.", { cmc: 0 }), inclusion: 0.8 },
  { card: card("Ponder", "Sorcery", "Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.", { cmc: 1 }), inclusion: 0.5 },
  { card: card("Sol Ring", "Artifact", "{T}: Add {C}{C}.", { cmc: 1 }), inclusion: 0.95 },
];

const everything = (plan: ReturnType<typeof planUpgrades>) =>
  [...plan.curve, ...plan.flexible, ...plan.categories.flatMap((g) => g.picks), ...plan.power].map((p) => p.card.name);

describe("scoreCandidate", () => {
  it("favours flexible cards that fill a gap", () => {
    const archdruid = scoreCandidate(candidates[4], gaps);
    // Ramp, and with synergy that strong, part of the plan.
    expect(archdruid.categories).toEqual(["ramp", "plan"]);
    const plainer = scoreCandidate({ ...candidates[4], card: card("Fyndhorn Elves", "Creature — Elf Druid", "{T}: Add {G}."), synergy: 0 }, gaps);
    expect(archdruid.score).toBeGreaterThan(plainer.score);
  });

  it("favours cheap ramp over expensive ramp, all else equal", () => {
    const cheap = scoreCandidate({ card: card("Rampant Growth", "Sorcery", "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", { cmc: 2 }), inclusion: 0.5 }, gaps);
    const dear = scoreCandidate(candidates[5], gaps);
    expect(cheap.score).toBeGreaterThan(dear.score);
  });
});

describe("planUpgrades", () => {
  const plan = planUpgrades(deck, candidates, (n) => n === "Sol Ring");

  it("secures the curve first with cheap ramp and cheap card advantage", () => {
    const curve = plan.curve.map((p) => p.card.name);
    expect(curve).toEqual(expect.arrayContaining(["Arcane Signet", "Skullclamp", "Elvish Archdruid"]));
    // Explosive Vegetation (4) and Harmonize (4) are too dear for the curve group.
    expect(curve).not.toContain("Explosive Vegetation");
    expect(curve).not.toContain("Harmonize");
  });

  it("fills the categories the deck is short of, and skips lands, cards it has, and selection", () => {
    const offered = plan.categories.flatMap((g) => g.picks.map((p) => p.card.name));
    expect(offered).toEqual(expect.arrayContaining(["Beast Within", "Harmonize"]));
    expect(everything(plan)).not.toContain("Gaea's Cradle");
    expect(everything(plan)).not.toContain("Sol Ring");
    expect(everything(plan)).not.toContain("Ponder");
    // Each card is offered once.
    expect(new Set(everything(plan)).size).toBe(everything(plan).length);
  });
});

describe("planUpgrades for a bracket", () => {
  const gameChangers = new Set(["Smothering Tithe", "Demonic Tutor", "Rhystic Study"]);
  const strong = [
    ...candidates,
    { card: card("Smothering Tithe", "Enchantment", "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.", { cmc: 4 }), inclusion: 0.6 },
    { card: card("Demonic Tutor", "Sorcery", "Search your library for a card, put that card into your hand, then shuffle.", { cmc: 2 }), inclusion: 0.4 },
    { card: card("Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.", { cmc: 3 }), inclusion: 0.5 },
    { card: card("Jokulhaups", "Sorcery", "Destroy all artifacts, creatures, and lands. They can't be regenerated.", { cmc: 6 }), inclusion: 0.2 },
    { card: card("Staff of Domination", "Artifact", "{3}, {T}: Untap target creature.\n{5}, {T}: Draw a card.", { cmc: 3 }), inclusion: 0.3 },
  ];
  const plan = (bracket: 1 | 2 | 3 | 4 | 5, inDeckGameChangers = 0) =>
    planUpgrades(deck, strong, (n) => n === "Sol Ring", {
      bracket,
      isGameChanger: (n) => gameChangers.has(n),
      gameChangersInDeck: inDeckGameChangers,
      completes: (n) => (n === "Staff of Domination" ? 3 : undefined),
    });

  it("leaves out Game Changers, land denial and stronger combos for Bracket 2", () => {
    const p = plan(2);
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
    const tutor = strong.find((c) => c.card.name === "Demonic Tutor")!;
    const four = scoreCandidate(tutor, gaps, { bracket: 4, isGameChanger: (n) => gameChangers.has(n) });
    const two = scoreCandidate(tutor, gaps, { bracket: 2, isGameChanger: (n) => gameChangers.has(n) });
    expect(four.score).toBeGreaterThan(two.score);
  });

  it("ranks cards EDHREC has never seen with the commander lower", () => {
    const tithe = strong.find((c) => c.card.name === "Smothering Tithe")!;
    const seen = scoreCandidate({ ...tithe, inclusion: 0 }, gaps, { bracket: 4 });
    const unseen = scoreCandidate({ card: tithe.card }, gaps, { bracket: 4 });
    expect(unseen.score).toBeLessThan(seen.score);
  });
});

describe("curveCuts", () => {
  it("suggests expensive cards that fill no category, most expensive first", () => {
    const deckCards = [
      card("Lathril, Blade of the Elves", "Legendary Creature — Elf Noble", "", { cmc: 4 }),
      card("Colossal Dreadmaw", "Creature — Dinosaur", "Trample", { cmc: 6 }),
      card("Craterhoof Behemoth", "Creature — Beast", "When this creature enters, creatures you control gain trample and get +X/+X, where X is the number of creatures you control.", { cmc: 8 }),
      card("Massacre Wurm", "Creature — Wurm", "When this creature enters, creatures your opponents control get -2/-2 until end of turn.", { cmc: 6 }),
      card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", { cmc: 1 }),
    ];
    const profile = deckProfile(deckCards.map((c) => ({ card: c, qty: 1 })), { commander: "Lathril, Blade of the Elves" });
    expect(curveCuts(deckCards, profile, "Lathril, Blade of the Elves").map((c) => c.name)).toEqual(["Craterhoof Behemoth", "Colossal Dreadmaw"]);
  });
});
