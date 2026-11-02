import { describe, expect, it } from "vitest";
import { catalogOf, parseShowcase, type ShowcaseCard } from "./co-collectibles";

const card = (over: Partial<ShowcaseCard>): ShowcaseCard => ({
  sku: "1",
  name: "Sol Ring",
  setName: "Reality Fracture",
  setCode: "fra",
  collectorNumber: "12",
  primaryTypes: ["Artifact"],
  isFoil: false,
  priceIncl: 815,
  quantity: 0,
  grade: null,
  ...over,
});

/** The page as Next.js sends it: the data escaped into a script tag, around the rest of the page. */
const page = (cards: ShowcaseCard[]) => {
  const data = `0:{"P":null}\n9:["$","$L1e",null,{"cards":${JSON.stringify(cards)},"game":"mtg"}]\n`;
  return `<html><body><h1>Warehouse - Main</h1><script>self.__next_f.push([1,${JSON.stringify(data)}])</script></body></html>`;
};

describe("parseShowcase", () => {
  it("reads the cards out of the page's data", () => {
    expect(parseShowcase(page([card({ sku: "1" }), card({ sku: "2", name: 'Say "Hello" {now}' })])).map((c) => c.name)).toEqual(["Sol Ring", 'Say "Hello" {now}']);
  });

  it("finds nothing on a page without cards", () => {
    expect(parseShowcase("<html><body>Maintenance</body></html>")).toEqual([]);
  });
});

describe("catalogOf", () => {
  it("files a card under its plain name, with its set, finish and peso price", () => {
    const catalog = catalogOf([card({ sku: "9", name: "Aerid Konstrari (Showcase) (Fracture Foil) (0417)", collectorNumber: "417", isFoil: true, priceIncl: 52185 })]);
    expect(catalog["aerid-konstrari"]).toMatchObject([
      { printId: "co-collectibles-9", setName: "Reality Fracture", setCode: "FRA", collectorNumber: "417", finish: "Foil", listings: [{ store: "Co Collectibles", pricePhp: 52185 }] },
    ]);
  });

  it("keeps each printing of a basic land under the one name", () => {
    const catalog = catalogOf([card({ sku: "1", name: "Plains (0281)" }), card({ sku: "2", name: "Plains (0282)" })]);
    expect(catalog.plains).toHaveLength(2);
  });

  it("leaves out art cards and tokens, which aren't cards for a deck", () => {
    const catalog = catalogOf([
      card({ name: "Thanos, the Mad Titan Art Card (9/9)", primaryTypes: [] }),
      card({ name: "Krang, Utrom Warlord Art Card (Gold-Stamped Signature) S ASTMT" }),
      card({ name: "Cactuar - Family Mart Japan Token", setCode: "", primaryTypes: [] }),
      card({ name: "Treasure // Clue Double-Sided Token T TMC 3 //" }),
    ]);
    expect(catalog).toEqual({});
  });

  it("marks every copy as unconfirmed while the store shows no stock at all", () => {
    const [print] = catalogOf([card({ quantity: 0 })])["sol-ring"];
    expect(print.listings[0]).toMatchObject({ unconfirmed: true, conditionLabel: "Stock not confirmed" });
    expect(print.listings[0].quantity).toBeUndefined();
  });

  it("trusts the counts once any card has stock, and drops what's sold out", () => {
    const catalog = catalogOf([card({ sku: "1", quantity: 3 }), card({ sku: "2", name: "Mana Crypt", quantity: 0 })]);
    expect(catalog["mana-crypt"]).toBeUndefined();
    const [listing] = catalog["sol-ring"][0].listings;
    expect(listing.quantity).toBe(3);
    expect(listing.unconfirmed).toBeUndefined();
    expect(listing.conditionLabel).toBeUndefined();
  });

  it("shows a graded copy's grade", () => {
    expect(catalogOf([card({ grade: "NM", quantity: 1 })])["sol-ring"][0].listings[0]).toMatchObject({ condition: "NM", conditionLabel: "NM" });
  });
});
