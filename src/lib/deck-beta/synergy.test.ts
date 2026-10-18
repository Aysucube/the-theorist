import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { analyzeDeck, cardTraits, deckColors, fitsColors, interactionsOf, partnersOf, pluralOf, tagLabel } from "./synergy";

const card = (name: string, typeLine: string, oracleText: string, extra: Partial<CardDetails> = {}): CardDetails => ({
  name,
  typeLine,
  oracleText,
  layout: "normal",
  keywords: [],
  cmc: 0,
  colorIdentity: [],
  ...extra,
});

// Rules text as Scryfall has it today ("enters", not "enters the battlefield").
const archdruid = card("Elvish Archdruid", "Creature — Elf Druid", "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.", { colorIdentity: ["G"] });
const llanowar = card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", { colorIdentity: ["G"] });
const elvesOfDeepShadow = card("Elves of Deep Shadow", "Creature — Elf Druid", "{T}: Add {B}. Elves of Deep Shadow deals 1 damage to you.", { colorIdentity: ["B"] });
const solRing = card("Sol Ring", "Artifact", "{T}: Add {C}{C}.");
const hardenedScales = card("Hardened Scales", "Enchantment", "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.");
const ballista = card("Walking Ballista", "Artifact Creature — Construct", "This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.");
const bloodArtist = card("Blood Artist", "Creature — Vampire", "Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.");
const viscera = card("Viscera Seer", "Creature — Vampire Wizard", "Sacrifice a creature: Scry 1.");
const pridemate = card("Ajani's Pridemate", "Creature — Cat Soldier", "Whenever you gain life, put a +1/+1 counter on Ajani's Pridemate.");
const swords = card("Swords to Plowshares", "Instant", "Exile target creature. Its controller gains life equal to its power.");
const krenko = card("Krenko, Mob Boss", "Legendary Creature — Goblin Warrior", "{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.");
const tithe = card("Smothering Tithe", "Enchantment", "Whenever an opponent draws a card, that player may pay {2}. If they don't, you create a Treasure token.");
const rhystic = card("Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.");
const avenger = card("Avenger of Zendikar", "Creature — Elemental", "Reach\nWhen this creature enters, create a 0/1 green Plant creature token for each land you control.\nLandfall — Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.", { keywords: ["Reach", "Landfall"] });
const cultivate = card("Cultivate", "Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.");
const forest = card("Forest", "Basic Land — Forest", "({T}: Add {G}.)");
const talrand = card("Talrand, Sky Summoner", "Legendary Creature — Merfolk Wizard", "Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.");
const doubling = card("Doubling Season", "Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.");
const horn = card("Herald's Horn", "Artifact", "As Herald's Horn enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.");

const vocab = ["Elf", "Druid", "Goblin", "Warrior", "Plant", "Drake", "Treasure", "Forest"];
const traits = (c: CardDetails) => cardTraits(c, vocab);

describe("cardTraits", () => {
  it("reads an Elf lord as rewarding Elves, not creatures in general", () => {
    const t = traits(archdruid);
    expect([...t.is]).toEqual(expect.arrayContaining(["type:Creature", "subtype:Elf", "subtype:Druid"]));
    expect(t.cares.has("subtype:Elf")).toBe(true);
    expect(t.cares.has("type:Creature")).toBe(false);
  });

  it("doesn't read a card's own name as a subtype it cares about", () => {
    expect(traits(elvesOfDeepShadow).cares.has("subtype:Elf")).toBe(false);
    expect(traits(llanowar).cares.size).toBe(0);
    expect(traits(solRing).cares.size).toBe(0);
  });

  it("tells +1/+1 counter payoffs from cards that make counters", () => {
    expect(traits(hardenedScales).cares.has("theme:counters")).toBe(true);
    expect(traits(hardenedScales).is.has("theme:counters")).toBe(false);
    expect(traits(ballista).is.has("theme:counters")).toBe(true);
    expect(traits(ballista).cares.has("theme:counters")).toBe(false);
  });

  it("finds sacrifice outlets, death payoffs and lifegain", () => {
    expect(traits(viscera).is.has("theme:sacrifice")).toBe(true);
    expect(traits(viscera).cares.has("type:Creature")).toBe(true);
    expect(traits(bloodArtist).cares.has("theme:sacrifice")).toBe(true);
    expect(traits(bloodArtist).is.has("theme:lifegain")).toBe(true);
    expect(traits(pridemate).cares.has("theme:lifegain")).toBe(true);
    expect(traits(pridemate).is.has("theme:counters")).toBe(true);
  });

  it("ignores removal and things that help opponents", () => {
    expect(traits(swords).cares.size).toBe(0);
    expect(traits(swords).is.has("theme:lifegain")).toBe(false);
    expect(traits(rhystic).cares.size).toBe(0);
    expect(traits(rhystic).is.has("theme:draw")).toBe(true);
    expect(traits(tithe).is.has("theme:draw")).toBe(false);
  });

  it("counts the tokens a card creates as things it makes", () => {
    const k = traits(krenko);
    expect([...k.is]).toEqual(expect.arrayContaining(["theme:tokens", "subtype:Goblin", "type:Creature"]));
    expect(k.cares.has("subtype:Goblin")).toBe(true);
    expect([...traits(tithe).is]).toEqual(expect.arrayContaining(["theme:tokens", "subtype:Treasure", "type:Artifact"]));
    const a = traits(avenger);
    expect([...a.is]).toEqual(expect.arrayContaining(["theme:tokens", "subtype:Plant", "theme:counters", "theme:blink"]));
    expect([...a.cares]).toEqual(expect.arrayContaining(["theme:landfall", "type:Land"]));
  });

  it("reads spell payoffs, ramp and replacement effects", () => {
    expect([...traits(talrand).cares]).toEqual(expect.arrayContaining(["type:Instant", "type:Sorcery"]));
    expect(traits(cultivate).is.has("theme:landfall")).toBe(true);
    expect(traits(cultivate).is.has("theme:spells")).toBe(true);
    const d = traits(doubling);
    expect([...d.cares]).toEqual(expect.arrayContaining(["theme:tokens", "theme:counters"]));
    expect(d.is.has("theme:tokens")).toBe(false);
  });
});

describe("analyzeDeck and interactionsOf", () => {
  const deck = [archdruid, llanowar, elvesOfDeepShadow, solRing, krenko, forest, avenger, cultivate, horn, viscera, bloodArtist];
  const analysis = analyzeDeck(deck);

  it("links an Elf lord to the deck's Elves", () => {
    const links = interactionsOf(analysis.traits.get("Elvish Archdruid")!, analysis.traits, "Elvish Archdruid");
    expect(links.uses[0]).toEqual({ tag: "subtype:Elf", cards: ["Elves of Deep Shadow", "Llanowar Elves"] });
    // Llanowar Elves is used by the lord (and the Horn, set to the deck's main type).
    const llanowarLinks = interactionsOf(analysis.traits.get("Llanowar Elves")!, analysis.traits, "Llanowar Elves");
    expect(llanowarLinks.usedBy.find((l) => l.tag === "subtype:Elf")?.cards).toEqual(["Elvish Archdruid", "Herald's Horn"]);
  });

  it("points 'choose a creature type' cards at the deck's main creature type", () => {
    expect(analysis.mainCreatureType).toBe("Elf");
    expect(analysis.traits.get("Herald's Horn")!.cares.has("subtype:Elf")).toBe(true);
  });

  it("links ramp to landfall, and sacrifice outlets to death payoffs", () => {
    const avengerLinks = interactionsOf(analysis.traits.get("Avenger of Zendikar")!, analysis.traits, "Avenger of Zendikar");
    expect(avengerLinks.uses.find((l) => l.tag === "theme:landfall")?.cards).toEqual(["Cultivate"]);
    expect(avengerLinks.uses.find((l) => l.tag === "type:Land")?.cards).toEqual(["Forest"]);
    const seer = interactionsOf(analysis.traits.get("Viscera Seer")!, analysis.traits, "Viscera Seer");
    expect(seer.usedBy.find((l) => l.tag === "theme:sacrifice")?.cards).toEqual(["Blood Artist"]);
    expect(partnersOf(seer).has("Llanowar Elves")).toBe(true); // fodder
  });

  it("lists specific links (subtypes, themes) before broad card types", () => {
    const seer = interactionsOf(analysis.traits.get("Viscera Seer")!, analysis.traits, "Viscera Seer");
    const kinds = seer.uses.map((l) => l.tag);
    expect(kinds.indexOf("type:Creature")).toBe(kinds.length - 1);
  });
});

describe("colors and labels", () => {
  it("collects the deck's colors in WUBRG order and checks fit", () => {
    expect(deckColors([archdruid, elvesOfDeepShadow, solRing])).toEqual(["B", "G"]);
    expect(fitsColors(archdruid, ["B", "G"])).toBe(true);
    expect(fitsColors(card("Bolt", "Instant", "", { colorIdentity: ["R"] }), ["B", "G"])).toBe(false);
  });

  it("names tags the way players say them", () => {
    expect(tagLabel("subtype:Elf")).toBe("Elves");
    expect(tagLabel("type:Sorcery")).toBe("Sorceries");
    expect(tagLabel("theme:counters")).toBe("+1/+1 Counters");
    expect(pluralOf("Ally")).toBe("Allies");
    expect(pluralOf("Sphinx")).toBe("Sphinxes");
    expect(pluralOf("Merfolk")).toBe("Merfolk");
  });
});
