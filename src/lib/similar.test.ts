import { afterEach, describe, expect, it, vi } from "vitest";
import { alternativeCandidates, getAlternatives, getSimilarCards } from "./similar";
import { tcgphSlug } from "./slugs";
import { fakeFetch, fixture } from "./sources/__fixtures__/load";
import type { CardDetails, ScryfallCard } from "./types";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const solRing: ScryfallCard = {
  id: "x",
  name: "Sol Ring",
  layout: "normal",
  typeLine: "Artifact",
  colorIdentity: [],
  scryfallUrl: "https://scryfall.com/card/x",
  commanderLegal: true,
  canBeCommander: false,
};

const SIMILAR = (JSON.parse(fixture("edhrec/cards-sol-ring.json")) as { similar: string[] }).similar;
const edhrec = "https://json.edhrec.com/pages/cards/sol-ring.json";
const tcgph = (name: string) => `https://tcgph.com/card/${tcgphSlug(name)}`;

describe("getSimilarCards", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns EDHREC's similar cards in order, each with a price and artwork", async () => {
    const routes: Record<string, string> = { [edhrec]: fixture("edhrec/cards-sol-ring.json") };
    // Esika's saved TCGph page stands in for each similar card's page.
    for (const name of SIMILAR) routes[tcgph(name)] = fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html");
    vi.stubGlobal("fetch", fakeFetch(routes).fetch);

    const similar = await getSimilarCards(solRing);

    expect(similar.map((s) => s.name)).toEqual(SIMILAR);
    for (const s of similar) {
      expect(s.cheapest?.pricePhp).toBeGreaterThan(0);
      expect(s.imageUrl).toMatch(/^https:\/\/cards\.scryfall\.io\//);
    }
  });

  it("is empty when EDHREC doesn't know the card", async () => {
    vi.stubGlobal("fetch", fakeFetch({}).fetch);
    expect(await getSimilarCards({ ...solRing, name: "Nope" })).toEqual([]);
  });

  it("keeps a card whose price lookup failed, flagged as unavailable", async () => {
    const routes: Record<string, string | { status: number }> = {
      [edhrec]: JSON.stringify({ ...JSON.parse(fixture("edhrec/cards-sol-ring.json")), similar: ["Mana Vault"] }),
      [tcgph("Mana Vault")]: { status: 503 },
    };
    vi.stubGlobal("fetch", fakeFetch(routes).fetch);

    const [vault] = await getSimilarCards(solRing);

    expect(vault).toMatchObject({ name: "Mana Vault", priceUnavailable: true, stores: 0 });
  });
});

describe("alternatives", () => {
  const card = (name: string, colorIdentity: string[], typeLine: string, oracleText: string): CardDetails => ({
    name,
    colorIdentity,
    typeLine,
    oracleText,
    layout: "normal",
    keywords: [],
    cmc: 2,
  });
  const details = (...cards: CardDetails[]) => Object.fromEntries(cards.map((c) => [c.name, c]));
  const names = (cards: CardDetails[]) => cards.map((c) => c.name);

  const tutor = card("Demonic Tutor", ["B"], "Sorcery", "Search your library for a card, put that card into your hand, then shuffle.");
  const grim = card("Grim Tutor", ["B"], "Sorcery", "Search your library for a card, put that card into your hand, then shuffle. You lose 3 life.");
  const cruel = card("Cruel Tutor", ["B"], "Sorcery", "Search your library for a card, then shuffle and put that card on top. You lose 2 life.");
  const lore = card("Night's Whisper", ["B"], "Sorcery", "You draw two cards and you lose 2 life.");
  const gift = card("Rampant Tutor", ["B", "G"], "Sorcery", "Search your library for a card, put that card into your hand, then shuffle.");
  const land = card("Cabal Coffers", [], "Land", "{2}, {T}: Add {B} for each Swamp you control.");

  describe("alternativeCandidates", () => {
    it("keeps EDHREC's picks and, beyond them, only cards doing the same job", () => {
      const found = alternativeCandidates(tutor, [grim.name, lore.name], [cruel.name, "Unknown Card"], details(tutor, grim, cruel, lore));
      expect(names(found)).toEqual(["Grim Tutor", "Night's Whisper", "Cruel Tutor"]);
      expect(names(alternativeCandidates(tutor, [grim.name], [lore.name], details(tutor, grim, lore)))).toEqual(["Grim Tutor"]);
    });

    it("leaves out the card itself, repeats, colors it can't be cast in, and lands for spells", () => {
      const found = alternativeCandidates(tutor, [grim.name, gift.name, land.name], [tutor.name, grim.name], details(tutor, grim, gift, land));
      expect(names(found)).toEqual(["Grim Tutor"]);
    });

    it("takes any land for a land", () => {
      const tower = card("Command Tower", [], "Land", "{T}: Add one mana of any color in your commander's color identity.");
      const found = alternativeCandidates(land, [], [tower.name, grim.name], details(land, tower, grim));
      expect(names(found)).toEqual(["Command Tower"]);
    });
  });

  describe("getAlternatives", () => {
    const edhrecPage = (name: string, similar: string[]) => JSON.stringify({ similar, container: { json_dict: { card: { name, num_decks: 1, potential_decks: 2 } } } });
    const scryfall = (name: string, color_identity: string[], type_line: string, oracle_text: string) => ({
      id: name,
      name,
      layout: "normal",
      type_line,
      oracle_text,
      color_identity,
      scryfall_uri: "https://scryfall.com/card/x",
      prices: {},
      legalities: { commander: "legal" },
    });
    const search = "Search your library for a card, put that card into your hand, then shuffle.";
    const collection = JSON.stringify({
      data: [scryfall("Demonic Tutor", ["B"], "Sorcery", search), scryfall("Grim Tutor", ["B"], "Sorcery", search), scryfall("Vampiric Tutor", ["B"], "Instant", search)],
    });
    const edhrecUrl = (slug: string) => `https://json.edhrec.com/pages/cards/${slug}.json`;
    const base = {
      "https://api.scryfall.com/cards/named?fuzzy=Demonic%20Tutor": JSON.stringify(scryfall("Demonic Tutor", ["B"], "Sorcery", search)),
      "https://api.scryfall.com/cards/collection": collection,
      [edhrecUrl("demonic-tutor")]: edhrecPage("Demonic Tutor", ["Grim Tutor", "Vampiric Tutor"]),
      [edhrecUrl("grim-tutor")]: edhrecPage("Grim Tutor", []),
      [edhrecUrl("vampiric-tutor")]: edhrecPage("Vampiric Tutor", []),
    };

    it("returns the cards in stock with their prices, and says when some couldn't be checked", async () => {
      vi.stubGlobal("fetch", fakeFetch({
        ...base,
        [tcgph("Grim Tutor")]: fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html"),
        [tcgph("Vampiric Tutor")]: { status: 503 },
      }).fetch);

      const result = await getAlternatives("Demonic Tutor");

      expect(result.alternatives.map((a) => a.name)).toEqual(["Grim Tutor"]);
      expect(result.alternatives[0].price.cheapest?.pricePhp).toBeGreaterThan(0);
      expect(result.alternatives[0].typeLine).toBe("Sorcery");
      expect(result.incomplete).toBe(true);
    });

    it("is empty for a card Scryfall doesn't know", async () => {
      vi.stubGlobal("fetch", fakeFetch({}).fetch);
      expect(await getAlternatives("Nope")).toEqual({ alternatives: [] });
    });
  });
});
