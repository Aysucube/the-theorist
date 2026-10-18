import { afterEach, describe, expect, it, vi } from "vitest";
import { getSimilarCards } from "./similar";
import { tcgphSlug } from "./slugs";
import { fakeFetch, fixture } from "./sources/__fixtures__/load";
import type { ScryfallCard } from "./types";

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
