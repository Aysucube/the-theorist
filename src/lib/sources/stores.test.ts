import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TcgphPrices, TcgphPrint } from "@/lib/types";
import { summarizePrices } from "./tcgph";
import { withStoreLists } from "./stores";

const lists = vi.hoisted(() => ({ co: [] as unknown[], collectibat: [] as unknown[], dragonsHoard: (async () => []) as () => Promise<unknown[]> }));
vi.mock("next/cache", () => ({ cacheLife: () => {} }));
vi.mock("./co-collectibles", () => ({ coCollectiblesPrints: async () => lists.co }));
vi.mock("./collectibat", () => ({ collectibatPrints: async () => lists.collectibat }));
vi.mock("./dragons-hoard", () => ({ dragonsHoardPrints: () => lists.dragonsHoard() }));

const print = (store: string, pricePhp: number, over: Partial<TcgphPrint["listings"][number]> = {}): TcgphPrint => ({
  printId: `${store}-${pricePhp}`,
  setName: "Foundations",
  setCode: "FDN",
  collectorNumber: "1",
  finish: "Nonfoil",
  url: `https://${store}.test/card`,
  listings: [{ listingId: `${store}-${pricePhp}`, store, condition: "NM", pricePhp, url: `https://${store}.test/card`, ...over }],
});
const tcgph: TcgphPrices = { url: "https://tcgph.com/card/sol-ring", prints: [print("HMO", 200)] };

describe("withStoreLists", () => {
  beforeEach(() => {
    lists.co = [];
    lists.collectibat = [];
    lists.dragonsHoard = async () => [];
  });

  it("leaves TCGph's answer alone when no store has the card", async () => {
    expect(await withStoreLists(tcgph, "Sol Ring")).toBe(tcgph);
    expect(await withStoreLists(null, "Sol Ring")).toBeNull();
  });

  it("adds each store's copies to TCGph's, so they compete on price", async () => {
    lists.co = [print("Co Collectibles", 150)];
    lists.collectibat = [print("Collectibat", 300)];
    const summary = summarizePrices((await withStoreLists(tcgph, "Sol Ring"))!);
    expect(summary.url).toBe(tcgph.url);
    expect(summary.stores).toBe(3);
    expect(summary.byStore.map((o) => [o.store, o.pricePhp])).toEqual([
      ["Co Collectibles", 150],
      ["HMO", 200],
      ["Collectibat", 300],
    ]);
  });

  it("keeps the other prices when a store can't be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    lists.co = [print("Co Collectibles", 150)];
    lists.dragonsHoard = async () => {
      throw new Error("down");
    };
    const summary = summarizePrices((await withStoreLists(tcgph, "Sol Ring"))!);
    expect(summary.byStore.map((o) => o.store)).toEqual(["Co Collectibles", "HMO"]);
  });

  it("adds Dragon's Hoard's copies too", async () => {
    lists.dragonsHoard = async () => [print("Dragon's Hoard", 90)];
    expect(summarizePrices((await withStoreLists(tcgph, "Sol Ring"))!).cheapest).toMatchObject({ store: "Dragon's Hoard", pricePhp: 90 });
  });

  it("stands in when TCGph doesn't know the card", async () => {
    lists.collectibat = [print("Collectibat", 300)];
    const prices = await withStoreLists(null, "Brand New Card");
    expect(prices?.url).toBe("https://Collectibat.test/card");
    expect(summarizePrices(prices!).cheapest?.store).toBe("Collectibat");
  });
});

describe("a copy nobody has confirmed", () => {
  it("still shows its price and says so, but doesn't count as in stock for a set's price", async () => {
    lists.co = [print("Co Collectibles", 150, { unconfirmed: true })];
    lists.collectibat = [];
    const summary = summarizePrices((await withStoreLists(tcgph, "Sol Ring"))!);
    expect(summary.cheapest).toMatchObject({ store: "Co Collectibles", pricePhp: 150, unconfirmed: true });
    expect(summary.bySet?.FDN).toMatchObject({ store: "HMO", pricePhp: 200 });
  });
});
