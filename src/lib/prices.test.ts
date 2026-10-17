import { afterEach, describe, expect, it, vi } from "vitest";
import { getPriceSummary } from "./prices";
import { fakeFetch, fixture } from "./sources/__fixtures__/load";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const named = (name: string) =>
  `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
const search = (name: string) =>
  `https://api.scryfall.com/cards/search?q=${encodeURIComponent(name)}&order=edhrec&unique=cards`;

/** The fields of a Scryfall card object that the app reads. */
function scryfallCard(name: string, layout = "normal") {
  return JSON.stringify({
    id: "test-id",
    name,
    layout,
    type_line: "Sorcery // Land",
    color_identity: ["B"],
    scryfall_uri: "https://scryfall.com/card/test",
    prices: { usd: "1.00" },
    legalities: { commander: "legal" },
  });
}

describe("getPriceSummary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses Scryfall's full name for cards EDHREC lists by their front face", async () => {
    // EDHREC says "Agadeem's Awakening"; TCGph only knows the two-faced name.
    // Esika's saved TCGph page stands in for the card's page.
    const tcgph = "https://tcgph.com/card/agadeem-s-awakening-agadeem-the-undercrypt";
    const { fetch, calls } = fakeFetch({
      [named("Agadeem's Awakening")]: scryfallCard("Agadeem's Awakening // Agadeem, the Undercrypt", "modal_dfc"),
      [tcgph]: fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html"),
    });
    vi.stubGlobal("fetch", fetch);

    const summary = await getPriceSummary("Agadeem's Awakening");

    expect(calls.map((c) => c.url)).toEqual([named("Agadeem's Awakening"), tcgph]);
    expect(summary?.url).toBe(tcgph);
    expect(summary?.cheapest?.pricePhp).toBeGreaterThan(0);
    expect(summary?.stores).toBeGreaterThan(0);
  });

  it("falls back to the name as given when Scryfall doesn't know it", async () => {
    const tcgph = "https://tcgph.com/card/sol-ring";
    const { fetch, calls } = fakeFetch({ [tcgph]: fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html") });
    vi.stubGlobal("fetch", fetch);

    const summary = await getPriceSummary("Sol Ring");

    expect(calls.map((c) => c.url)).toEqual([named("Sol Ring"), search("Sol Ring"), tcgph]);
    expect(summary?.url).toBe(tcgph);
  });

  it("returns null when TCGph doesn't list the card", async () => {
    const { fetch } = fakeFetch({
      [named("Nope")]: scryfallCard("Nope"),
      "https://tcgph.com/card/nope": fixture("tcgph/unknown-card.html"),
    });
    vi.stubGlobal("fetch", fetch);

    expect(await getPriceSummary("Nope")).toBeNull();
  });
});
