import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { pairingsInDeck, pairingStrength, recommend } from "./recommend";
import { analyzeDeck } from "./synergy";

const card = (name: string, typeLine: string, oracleText: string, colorIdentity: string[] = []): CardDetails => ({
  name,
  typeLine,
  oracleText,
  colorIdentity,
  layout: "normal",
  keywords: [],
  cmc: 0,
});

const archdruid = card("Elvish Archdruid", "Creature — Elf Druid", "Other Elf creatures you control get +1/+1.", ["G"]);
const llanowar = card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", ["G"]);
const solRing = card("Sol Ring", "Artifact", "{T}: Add {C}{C}.");

const elvishMystic = card("Elvish Mystic", "Creature — Elf Druid", "{T}: Add {G}.", ["G"]);
const priest = card("Priest of Titania", "Creature — Elf Druid", "{T}: Add {G} for each Elf on the battlefield.", ["G"]);
const bolt = card("Lightning Bolt", "Instant", "Lightning Bolt deals 3 damage to any target.", ["R"]);
const signet = card("Arcane Signet", "Artifact", "{T}: Add one mana of any color in your commander's color identity.");

describe("recommend", () => {
  const deck = analyzeDeck([archdruid, llanowar, solRing]);
  const recs = recommend({
    focus: archdruid,
    deck,
    deckNames: ["Elvish Archdruid", "llanowar elves", "Sol Ring"],
    pairings: [
      { name: "Lightning Bolt", list: "Instants", lift: 5 },
      { name: "Arcane Signet", list: "Mana Artifacts", lift: 1.1 },
      { name: "Elvish Mystic", list: "Creatures", lift: 2 },
      { name: "Priest of Titania", list: "Creatures", lift: 3 },
      { name: "Llanowar Elves", list: "Creatures", lift: 4 },
    ],
    similar: [],
    details: { "Lightning Bolt": bolt, "Arcane Signet": signet, "Elvish Mystic": elvishMystic, "Priest of Titania": priest, "Llanowar Elves": llanowar },
  });

  it("leaves out cards already in the deck, whatever their spelling", () => {
    expect(recs.map((r) => r.card.name)).not.toContain("Llanowar Elves");
  });

  it("puts the deck's colors first, then cards that work with the focus card, then EDHREC's strongest", () => {
    expect(recs.map((r) => r.card.name)).toEqual(["Priest of Titania", "Elvish Mystic", "Arcane Signet", "Lightning Bolt"]);
    expect(recs[0]).toMatchObject({ inColors: true, withFocus: ["subtype:Elf"], pairing: { lift: 3 } });
    expect(recs.at(-1)).toMatchObject({ inColors: false });
  });
});

describe("pairingsInDeck", () => {
  it("finds the deck's cards in EDHREC's list, by the deck's own spelling", () => {
    const found = pairingsInDeck(
      [
        { name: "Llanowar Elves", list: "Creatures", lift: 4 },
        { name: "Delver of Secrets", list: "Creatures", lift: 2 },
      ],
      ["llanowar elves", "Delver of Secrets // Insectile Aberration"],
    );
    expect(found.map((p) => p.name)).toEqual(["llanowar elves", "Delver of Secrets // Insectile Aberration"]);
  });
});

describe("pairingStrength", () => {
  it("prefers a pairing many decks play over a high lift from a handful of decks", () => {
    const solid = pairingStrength({ lift: 35, inclusion: 0.53 });
    const oddity = pairingStrength({ lift: 50, inclusion: 0.05 });
    const staple = pairingStrength({ lift: 1.05, inclusion: 0.9 });
    expect(solid).toBeGreaterThan(oddity);
    expect(oddity).toBeGreaterThan(staple);
    expect(pairingStrength({ lift: 0.8, inclusion: 0.5 })).toBe(0);
  });
});
