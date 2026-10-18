import { describe, expect, it } from "vitest";
import { buyAnywhere, buyCheapest, enoughFor, listingsOf, stockOf } from "./stock";
import type { ListingBrief } from "./types";

const listing = (store: string, pricePhp: number, quantity?: number): ListingBrief => ({
  store,
  pricePhp,
  quantity,
  condition: "NM",
  url: `https://${store.toLowerCase()}.example/${pricePhp}`,
});
const bought = (purchase: ReturnType<typeof buyCheapest>) =>
  purchase.parts.map((p) => [p.offer.store, p.offer.pricePhp, p.qty]);

describe("buyCheapest", () => {
  it("fills up from a store's next-cheapest listing", () => {
    const purchase = buyCheapest([[listing("HMO", 30, 5), listing("HMO", 35, 10)]], 8);
    expect(bought(purchase)).toEqual([
      ["HMO", 30, 5],
      ["HMO", 35, 3],
    ]);
    expect(purchase).toMatchObject({ qty: 8, totalPhp: 255 });
  });

  it("takes whichever store is cheaper, copy by copy", () => {
    const purchase = buyCheapest([[listing("HMO", 30, 5), listing("HMO", 35, 10)], [listing("GGH", 32, 10)]], 8);
    expect(bought(purchase)).toEqual([
      ["HMO", 30, 5],
      ["GGH", 32, 3],
    ]);
  });

  it("prefers the store with more copies at an equal price, so the card isn't split", () => {
    const purchase = buyCheapest([[listing("HMO", 30, 2)], [listing("GGH", 30, 5)]], 4);
    expect(bought(purchase)).toEqual([["GGH", 30, 4]]);
  });

  it("buys what there is when the listings run out", () => {
    const purchase = buyCheapest([[listing("HMO", 30, 2)], [listing("GGH", 40)]], 10);
    expect(purchase).toMatchObject({ qty: 3, totalPhp: 2 * 30 + 40 });
  });
});

describe("enoughFor", () => {
  it("keeps the cheapest listings that hold the copies asked for", () => {
    const listings = [listing("HMO", 1, 2), listing("HMO", 2, 2), listing("HMO", 3, 2)];
    expect(enoughFor(listings, 3)).toEqual(listings.slice(0, 2));
    expect(enoughFor(listings, 10)).toEqual(listings);
  });
});

describe("prices saved by older versions", () => {
  it("fall back to the store's cheapest listing and its count", () => {
    const old = listing("HMO", 30, 4);
    expect(listingsOf(old)).toEqual([old]);
    expect(stockOf(old)).toBe(4);
    expect(buyAnywhere([old], 2)).toMatchObject({ qty: 2, totalPhp: 60 });
  });
});
