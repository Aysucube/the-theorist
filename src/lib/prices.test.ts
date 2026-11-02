import { afterEach, describe, expect, it, vi } from "vitest";
import { getCardPreview, getPriceSummary } from "./prices";
import { fakeFetch, fixture } from "./sources/__fixtures__/load";
import type { TcgphPrint } from "./types";

// What the stores outside TCGph have, by the name they were asked for.
const stores = vi.hoisted(() => ({ prints: {} as Record<string, unknown[]>, asked: [] as string[] }));

vi.mock("next/cache", () => ({ cacheLife: () => {} }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./sources/co-collectibles", () => ({
  coCollectiblesPrints: async (name: string) => {
    stores.asked.push(name);
    return stores.prints[name] ?? [];
  },
}));
vi.mock("./sources/collectibat", () => ({ collectibatPrints: async () => [] }));

const storeCopy = (pricePhp: number): TcgphPrint => ({
  printId: "co-1",
  setName: "Foundations",
  url: "https://store.test",
  listings: [{ listingId: "co-1", store: "Co Collectibles", condition: "", pricePhp, url: "https://store.test" }],
});

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
  afterEach(() => {
    vi.unstubAllGlobals();
    stores.prints = {};
    stores.asked = [];
  });

  it("prices a card straight from TCGph without asking Scryfall", async () => {
    // Esika's saved TCGph page stands in for Sol Ring's.
    const tcgph = "https://tcgph.com/card/sol-ring";
    const { fetch, calls } = fakeFetch({ [tcgph]: fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html") });
    vi.stubGlobal("fetch", fetch);

    const summary = await getPriceSummary("Sol Ring");

    expect(calls.map((c) => c.url)).toEqual([tcgph]);
    expect(summary?.url).toBe(tcgph);
    expect(summary?.cheapest?.pricePhp).toBeGreaterThan(0);
  });

  it("asks Scryfall for the full name when TCGph doesn't know a front-face name", async () => {
    // EDHREC says "Agadeem's Awakening"; TCGph only knows the two-faced name.
    const short = "https://tcgph.com/card/agadeem-s-awakening";
    const full = "https://tcgph.com/card/agadeem-s-awakening-agadeem-the-undercrypt";
    const { fetch, calls } = fakeFetch({
      [short]: fixture("tcgph/unknown-card.html"),
      [named("Agadeem's Awakening")]: scryfallCard("Agadeem's Awakening // Agadeem, the Undercrypt", "modal_dfc"),
      [full]: fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html"),
    });
    vi.stubGlobal("fetch", fetch);

    const summary = await getPriceSummary("Agadeem's Awakening");

    expect(calls.map((c) => c.url)).toEqual([short, named("Agadeem's Awakening"), full]);
    expect(summary?.url).toBe(full);
    expect(summary?.stores).toBeGreaterThan(0);
  });

  it("prices a card only the other stores have", async () => {
    const { fetch } = fakeFetch({
      "https://tcgph.com/card/brand-new": fixture("tcgph/unknown-card.html"),
      [named("Brand New")]: scryfallCard("Brand New"),
    });
    vi.stubGlobal("fetch", fetch);
    stores.prints["Brand New"] = [storeCopy(150)];

    const summary = await getPriceSummary("Brand New");

    expect(summary?.url).toBe("https://store.test");
    expect(summary?.cheapest).toMatchObject({ store: "Co Collectibles", pricePhp: 150 });
  });

  it("finds TCGph's two-faced page even when another store knows the front face, and shows both", async () => {
    const short = "https://tcgph.com/card/agadeem-s-awakening";
    const full = "https://tcgph.com/card/agadeem-s-awakening-agadeem-the-undercrypt";
    const fullName = "Agadeem's Awakening // Agadeem, the Undercrypt";
    const { fetch } = fakeFetch({
      [short]: fixture("tcgph/unknown-card.html"),
      [named("Agadeem's Awakening")]: scryfallCard(fullName, "modal_dfc"),
      [full]: fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html"),
    });
    vi.stubGlobal("fetch", fetch);
    stores.prints[fullName] = [storeCopy(1)];

    const summary = await getPriceSummary("Agadeem's Awakening");

    expect(summary?.url).toBe(full);
    expect(stores.asked).toEqual([fullName]);
    expect(summary?.cheapest).toMatchObject({ store: "Co Collectibles", pricePhp: 1 });
    expect(summary?.stores).toBeGreaterThan(1);
  });

  it("doesn't ask TCGph twice when Scryfall gives back the same name", async () => {
    const { fetch, calls } = fakeFetch({
      "https://tcgph.com/card/nope": fixture("tcgph/unknown-card.html"),
      [named("Nope")]: scryfallCard("Nope"),
    });
    vi.stubGlobal("fetch", fetch);

    expect(await getPriceSummary("Nope")).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(["https://tcgph.com/card/nope", named("Nope")]);
  });

  it("returns null when neither TCGph nor Scryfall knows the name", async () => {
    const { fetch, calls } = fakeFetch({ "https://tcgph.com/card/zzz": fixture("tcgph/unknown-card.html") });
    vi.stubGlobal("fetch", fetch);

    expect(await getPriceSummary("Zzz")).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(["https://tcgph.com/card/zzz", named("Zzz"), search("Zzz")]);
  });
});

describe("getCardPreview", () => {
  afterEach(() => vi.unstubAllGlobals());

  const solRingCard = JSON.stringify({
    ...JSON.parse(scryfallCard("Sol Ring")),
    type_line: "Artifact",
    mana_cost: "{1}",
    color_identity: [],
    oracle_text: "{T}: Add {C}{C}.",
  });

  it("combines price, artwork, rules text, deck stats and similar cards", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch({
        "https://tcgph.com/card/sol-ring": fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html"),
        [named("Sol Ring")]: solRingCard,
        "https://json.edhrec.com/pages/cards/sol-ring.json": fixture("edhrec/cards-sol-ring.json"),
      }).fetch,
    );

    const preview = await getCardPreview("Sol Ring");

    expect(preview.cheapest?.pricePhp).toBeGreaterThan(0);
    expect(preview.imageUrl).toMatch(/^https:\/\/cards\.scryfall\.io\//);
    expect(preview).toMatchObject({
      name: "Sol Ring",
      typeLine: "Artifact",
      manaCost: "{1}",
      colorIdentity: [],
      oracleText: "{T}: Add {C}{C}.",
    });
    expect(preview.decks?.inclusion).toBeGreaterThan(0);
    expect(preview.decks?.topCommanders).toHaveLength(3);
    expect(preview.similar).toContain("Mana Vault");
    expect(preview.priceUnavailable).toBeUndefined();
  });

  it("uses Scryfall's image when no PH store has the card", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch({
        "https://tcgph.com/card/nope": fixture("tcgph/unknown-card.html"),
        [named("Nope")]: JSON.stringify({ ...JSON.parse(scryfallCard("Nope")), image_uris: { normal: "https://cards.scryfall.io/normal/nope.jpg" } }),
      }).fetch,
    );

    const preview = await getCardPreview("Nope");

    expect(preview).toMatchObject({ name: "Nope", imageUrl: "https://cards.scryfall.io/normal/nope.jpg", stores: 0 });
    expect(preview.cheapest).toBeUndefined();
    expect(preview.decks).toBeUndefined();
  });

  it("still shows the card's details when TCGph is down", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch({
        "https://tcgph.com/card/sol-ring": { status: 503 },
        [named("Sol Ring")]: solRingCard,
      }).fetch,
    );

    const preview = await getCardPreview("Sol Ring");

    expect(preview.priceUnavailable).toBe(true);
    expect(preview.oracleText).toBe("{T}: Add {C}{C}.");
  });
});

describe("getCardPreview completeness", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("marks a preview incomplete when Scryfall failed, so the browser asks again", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch({
        "https://tcgph.com/card/sol-ring": fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html"),
        [named("Sol Ring")]: { status: 500 },
      }).fetch,
    );
    const preview = await getCardPreview("Sol Ring");
    expect(preview.incomplete).toBe(true);
    expect(preview.cheapest).toBeDefined();
  });

  it("doesn't mark a preview incomplete just because no store has the card", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch({
        "https://tcgph.com/card/nope": fixture("tcgph/unknown-card.html"),
        [named("Nope")]: scryfallCard("Nope"),
      }).fetch,
    );
    expect((await getCardPreview("Nope")).incomplete).toBeUndefined();
  });
});
