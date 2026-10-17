import { afterEach, describe, expect, it, vi } from "vitest";
import type { TcgphPrint } from "@/lib/types";
import { fakeFetch, fixture } from "./__fixtures__/load";
import { cheapestFirst, getPrices, mergePrints, parseCardPage, summarizePrices } from "./tcgph";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const SOL_RING = "https://tcgph.com/card/sol-ring";
const KNOWN_CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG", "U"]);

/** How many store links the raw page has, so we can check none were dropped. */
function storeLinkCount(html: string) {
  return html.match(/data-ga-event="store_click"/g)?.length ?? 0;
}

function allListings(prints: TcgphPrint[]) {
  return prints.flatMap((p) => p.listings);
}

// These checks describe the page's shape, not today's prices, so they keep
// passing after `npm run fixtures:update` unless TCGph changes its markup.
function expectWellFormed(prints: TcgphPrint[]) {
  expect(prints.length).toBeGreaterThan(0);
  for (const print of prints) {
    expect(print.setName).not.toBe("");
    expect(print.setCode).toMatch(/^[A-Z0-9]{2,6}$/);
    expect(print.collectorNumber).toBeTruthy();
    expect(["Nonfoil", "Foil", "Etched"]).toContain(print.finish);
    expect(print.language).toMatch(/^[A-Z]{2}$/);
    expect(print.url).toMatch(/^https:\/\/tcgph\.com\/cards\//);
    expect(print.listings.length).toBeGreaterThan(0);
  }
  for (const listing of allListings(prints)) {
    expect(listing.listingId).toMatch(/^\d+$/);
    expect(listing.store).not.toBe("");
    expect(KNOWN_CONDITIONS).toContain(listing.condition);
    expect(listing.conditionLabel).toBeTruthy();
    expect(listing.quantity).toBeGreaterThanOrEqual(1);
    expect(listing.pricePhp).toBeGreaterThan(0);
    expect(listing.url).toMatch(/^https?:\/\//);
  }
}

describe("parseCardPage", () => {
  it("reads every listing on a card page", () => {
    const html = fixture("tcgph/sol-ring.html");
    const page = parseCardPage(html, SOL_RING);

    expect(page.isCardPage).toBe(true);
    expectWellFormed(page.prints);
    expect(allListings(page.prints)).toHaveLength(storeLinkCount(html));
  });

  it("finds the link to the next page", () => {
    expect(parseCardPage(fixture("tcgph/sol-ring.html"), SOL_RING).nextPage).toBe(2);
    expect(parseCardPage(fixture("tcgph/sol-ring-page-2.html"), SOL_RING, 2).nextPage).toBe(3);
  });

  it("reads a double-faced card that fits on one page", () => {
    const html = fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html");
    const page = parseCardPage(html, "https://tcgph.com/card/esika-god-of-the-tree-the-prismatic-bridge");

    expect(page.isCardPage).toBe(true);
    expect(page.nextPage).toBeNull();
    expectWellFormed(page.prints);
    expect(allListings(page.prints)).toHaveLength(storeLinkCount(html));
  });

  it("recognizes TCGph's page for an unknown card", () => {
    const page = parseCardPage(fixture("tcgph/unknown-card.html"), "https://tcgph.com/card/x");
    expect(page.isCardPage).toBe(false);
    expect(page.prints).toEqual([]);
  });

  it("converts prices from centavos to pesos", () => {
    const html = fixture("tcgph/sol-ring.html");
    const first = html.match(/data-ga-price="(\d+)"/)![1];
    const page = parseCardPage(html, SOL_RING);
    expect(allListings(page.prints)[0].pricePhp).toBe(Number(first) / 100);
  });
});

describe("mergePrints", () => {
  const listing = (id: string, pricePhp: number) => ({
    listingId: id,
    store: "HMO",
    condition: "NM",
    pricePhp,
    url: "https://example.com",
  });
  const print = (printId: string, listings: ReturnType<typeof listing>[]): TcgphPrint => ({
    printId,
    setName: "Set",
    url: "https://tcgph.com/cards/x",
    listings,
  });

  it("adds new listings to a printing seen on an earlier page and skips repeats", () => {
    const merged = new Map<string, TcgphPrint>();
    mergePrints(merged, [print("p1", [listing("a", 100)])]);
    mergePrints(merged, [print("p1", [listing("a", 100), listing("b", 120)]), print("p2", [listing("c", 90)])]);

    expect(merged.get("p1")!.listings.map((l) => l.listingId)).toEqual(["a", "b"]);
    expect(merged.get("p2")!.listings.map((l) => l.listingId)).toEqual(["c"]);
  });

  it("does not modify the page it copies from", () => {
    const page = [print("p1", [listing("a", 100)])];
    const merged = new Map<string, TcgphPrint>();
    mergePrints(merged, page);
    mergePrints(merged, [print("p1", [listing("b", 120)])]);
    expect(page[0].listings).toHaveLength(1);
  });
});

describe("getPrices", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows the next-page links and combines the pages", async () => {
    const page1 = fixture("tcgph/sol-ring.html");
    const page2 = fixture("tcgph/sol-ring-page-2.html");
    // Page 2 links to page 3, which we don't serve: the 404 ends the walk.
    const { fetch, calls } = fakeFetch({ [SOL_RING]: page1, [`${SOL_RING}?page=2`]: page2 });
    vi.stubGlobal("fetch", fetch);

    const prices = await getPrices("sol-ring");

    expect(calls.map((c) => c.url)).toEqual([SOL_RING, `${SOL_RING}?page=2`, `${SOL_RING}?page=3`]);
    expect(calls[0].headers["user-agent"]).toMatch(/^CommanderPH\//);

    const expected = new Set([
      ...allListings(parseCardPage(page1, SOL_RING).prints).map((l) => l.listingId),
      ...allListings(parseCardPage(page2, SOL_RING, 2).prints).map((l) => l.listingId),
    ]);
    expect(allListings(prices!.prints)).toHaveLength(expected.size);
    expect(prices!.url).toBe(SOL_RING);
  });

  it("returns null for a card TCGph doesn't have", async () => {
    const { fetch } = fakeFetch({ "https://tcgph.com/card/nope": fixture("tcgph/unknown-card.html") });
    vi.stubGlobal("fetch", fetch);
    expect(await getPrices("nope")).toBeNull();
  });

  it("throws when TCGph is down, so the page can say so", async () => {
    const { fetch } = fakeFetch({ [SOL_RING]: { status: 503 } });
    vi.stubGlobal("fetch", fetch);
    await expect(getPrices("sol-ring")).rejects.toThrow("TCGph: HTTP 503");
  });
});

describe("summarizePrices", () => {
  it("picks the cheapest listing and counts stores and listings", () => {
    const page = parseCardPage(fixture("tcgph/sol-ring.html"), SOL_RING);
    const listings = allListings(page.prints);
    const summary = summarizePrices({ url: SOL_RING, prints: page.prints });

    const lowest = Math.min(...listings.map((l) => l.pricePhp));
    expect(summary.cheapest?.pricePhp).toBe(lowest);
    expect(listings).toContainEqual(expect.objectContaining({ store: summary.cheapest?.store, pricePhp: lowest }));
    expect(summary.stores).toBe(new Set(listings.map((l) => l.store)).size);
    expect(summary.listings).toBe(listings.length);
    expect(summary.url).toBe(SOL_RING);
  });

  it("lists each store once, at its cheapest price, cheapest store first", () => {
    const page = parseCardPage(fixture("tcgph/sol-ring.html"), SOL_RING);
    const listings = allListings(page.prints);
    const { byStore, stores } = summarizePrices({ url: SOL_RING, prints: page.prints });

    expect(byStore).toHaveLength(stores);
    const prices = byStore.map((s) => s.pricePhp);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    for (const entry of byStore) {
      const cheapestAtStore = Math.min(...listings.filter((l) => l.store === entry.store).map((l) => l.pricePhp));
      expect(entry.pricePhp).toBe(cheapestAtStore);
      // Enough to buy that exact copy: a link to it and which printing it is.
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.printing).toMatch(/^[A-Z0-9]{2,6} #\S+ · (Nonfoil|Foil|Etched)$/);
    }
  });

  it("has no cheapest listing when nothing is in stock", () => {
    expect(summarizePrices({ url: SOL_RING, prints: [] })).toEqual({
      url: SOL_RING,
      cheapest: undefined,
      stores: 0,
      listings: 0,
      byStore: [],
    });
  });
});

describe("cheapestFirst", () => {
  it("lists every listing from lowest to highest price", () => {
    const html = fixture("tcgph/sol-ring.html");
    const page = parseCardPage(html, SOL_RING);
    const rows = cheapestFirst({ url: SOL_RING, prints: page.prints });

    const prices = rows.map((r) => r.listing.pricePhp);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(rows).toHaveLength(storeLinkCount(html));
  });
});
