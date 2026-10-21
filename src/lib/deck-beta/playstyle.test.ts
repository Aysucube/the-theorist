import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { deckHubs, looseCards } from "./playstyle";
import { analyzeDeck } from "./synergy";

const card = (name: string, typeLine: string, oracleText = ""): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity: ["G"],
  layout: "normal",
  keywords: [],
  cmc: 0,
});

const deck = analyzeDeck([
  card("Elvish Archdruid", "Creature — Elf Druid", "Other Elf creatures you control get +1/+1."),
  card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}."),
  card("Elvish Mystic", "Creature — Elf Druid", "{T}: Add {G}."),
  card("Viscera Seer", "Creature — Vampire Wizard", "Sacrifice a creature: Scry 1."),
  card("Blood Artist", "Creature — Vampire", "Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life."),
  card("Forest", "Basic Land — Forest"),
  card("Swords to Plowshares", "Instant", "Exile target creature. Its controller gains life equal to its power."),
]);

describe("deckHubs", () => {
  it("names what the deck is built around, specific themes before card types", () => {
    const hubs = deckHubs(deck);
    const tags = hubs.map((h) => h.tag);
    expect(tags).toContain("subtype:Elf");
    expect(tags.indexOf("subtype:Elf")).toBeLessThan(tags.indexOf("type:Creature"));
    const elves = hubs.find((h) => h.tag === "subtype:Elf")!;
    expect(elves.payoffs).toEqual(["Elvish Archdruid"]);
    expect(elves.enablers).toEqual(["Elvish Archdruid", "Elvish Mystic", "Llanowar Elves"]);
  });

  it("leaves out lands as a playstyle", () => {
    expect(deckHubs(deck).map((h) => h.tag)).not.toContain("type:Land");
  });
});

describe("looseCards", () => {
  it("lists cards that interact with nothing else in the deck", () => {
    expect(looseCards(deck, (name) => name === "Forest")).toEqual(["Swords to Plowshares"]);
  });
});
