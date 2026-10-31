import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { commanderGamePlan, planInDeck } from "./game-plan";
import { cardTraits, subtypeVocabulary } from "./synergy";

const card = (name: string, typeLine: string, oracleText: string, extra: Partial<CardDetails> = {}): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity: ["B", "G"],
  layout: "normal",
  keywords: [],
  cmc: 4,
  ...extra,
});

// Rules text as Scryfall has it.
const lathril = card(
  "Lathril, Blade of the Elves",
  "Legendary Creature — Elf Noble",
  "Menace\nWhenever Lathril, Blade of the Elves deals combat damage to a player, create that many 1/1 green Elf Warrior creature tokens.\n{T}, Tap ten untapped Elves you control: Each opponent loses 10 life and you gain 10 life.",
  { keywords: ["Menace"] },
);
const zombieLord = card("Grimgrin's Herald, the Test", "Legendary Creature — Zombie Wizard", "Other Zombie creatures you control get +1/+1 and have deathtouch.", {
  colorIdentity: ["B"],
  cmc: 3,
});
const plain = card("Plainsworth, the Test", "Legendary Creature — Human Soldier", "Vigilance", { colorIdentity: ["W"], cmc: 7, keywords: ["Vigilance"] });

const traitsOf = (c: CardDetails) => cardTraits(c, subtypeVocabulary([c]));

describe("commanderGamePlan", () => {
  const plan = commanderGamePlan({
    commander: lathril,
    traits: traitsOf(lathril),
    themes: [
      { name: "Elves", slug: "elves", numDecks: 4107 },
      { name: "Tokens", slug: "tokens", numDecks: 1200 },
    ],
    numDecks: 36240,
    averages: { lands: 36, basics: 20, nonbasics: 16, creatures: 34, instants: 8, sorceries: 7, artifacts: 6, enchantments: 6, planeswalkers: 0, battles: 0 },
    curveAverage: 2.8,
  });

  it("reads what the commander makes and rewards, and centres the plan on it", () => {
    expect(plan.role).toBe("engine");
    expect(plan.focusTag).toBe("subtype:Elf");
    expect(plan.summary[0]).toMatch(/^Lathril both makes and rewards Elves/);
    expect(plan.summary[0]).toMatch(/close out the game itself/);
    expect(plan.summary.join(" ")).toMatch(/pressure opponents in combat itself \(menace\)/);
  });

  it("says how players build it on EDHREC, and what the 99 needs", () => {
    expect(plan.summary.join(" ")).toMatch(/most popular playstyle is Elves \(11%\), then Tokens \(3%\)/);
    expect(plan.playstyles[0]).toMatchObject({ name: "Elves", decks: 4107 });
    expect(plan.lands.count).toBe(35);
    expect(plan.focus.join(" ")).toMatch(/about 34 creatures/);
    expect(plan.focus.join(" ")).toMatch(/Two colors/);
  });

  it("follows a chosen playstyle", () => {
    const tokens = commanderGamePlan({ commander: lathril, traits: traitsOf(lathril), numDecks: 36240, playstyle: { name: "Tokens", numDecks: 1200 } });
    expect(tokens.summary.join(" ")).toMatch(/You’re building Tokens, like 1,200 of them/);
    expect(tokens.focus[0]).toBe("Plan: about 30 cards for Tokens, led by what those decks play most.");
    expect(plan.summary.join(" ")).not.toMatch(/You’re building/);
  });

  it("asks a payoff commander for enablers", () => {
    const lord = commanderGamePlan({ commander: zombieLord, traits: traitsOf(zombieLord) });
    expect(lord.role).toBe("payoff");
    expect(lord.summary.join(" ")).toMatch(/rewards Zombies/);
    expect(lord.summary.join(" ")).toMatch(/enablers: cards that are or make Zombies/);
  });

  it("falls back to the template for a commander with no theme, and notes a high cost", () => {
    const p = commanderGamePlan({ commander: plain, traits: traitsOf(plain) });
    expect(p.role).toBe("value");
    expect(p.focusTag).toBeUndefined();
    expect(p.summary.join(" ")).toMatch(/led by the template/);
    expect(p.summary.join(" ")).toMatch(/At 7 mana it arrives late/);
    expect(p.lands.count).toBe(38);
  });
});

describe("planInDeck", () => {
  it("finds the deck's enablers and payoffs for the commander's plan", () => {
    const plan = commanderGamePlan({ commander: lathril, traits: traitsOf(lathril) });
    const elf = card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.");
    const archdruid = card("Elvish Archdruid", "Creature — Elf Druid", "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.");
    const vocabulary = subtypeVocabulary([lathril, elf, archdruid]);
    const traits = new Map([lathril, elf, archdruid].map((c) => [c.name, cardTraits(c, vocabulary)]));
    expect(planInDeck(plan, traits)).toEqual({ enablers: ["Llanowar Elves"], payoffs: ["Elvish Archdruid"] });
  });
});
