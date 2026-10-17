import { describe, expect, it } from "vitest";
import { pricePrintings } from "./printings";
import { fixture } from "./sources/__fixtures__/load";
import { parseCardPage } from "./sources/tcgph";
import type { Printing, TcgphPrices, TcgphPrint } from "./types";

const SOL_RING = "https://tcgph.com/card/sol-ring";

/** Sol Ring's printings as getPrintings() returns them, from the saved Scryfall response. */
function solRingPrintings(): Printing[] {
  const raw = JSON.parse(fixture("scryfall/prints-sol-ring.json")) as {
    data: { set: string; set_name: string; collector_number: string; released_at: string; rarity: string; finishes: string[]; scryfall_uri: string; image_uris?: { small?: string } }[];
  };
  return raw.data.map((p) => ({
    setCode: p.set.toUpperCase(),
    setName: p.set_name,
    collectorNumber: p.collector_number,
    releasedAt: p.released_at,
    rarity: p.rarity,
    finishes: p.finishes,
    imageUrl: p.image_uris?.small,
    scryfallUrl: p.scryfall_uri,
  }));
}

function solRingPrices(): TcgphPrices {
  return { url: SOL_RING, prints: parseCardPage(fixture("tcgph/sol-ring.html"), SOL_RING).prints };
}

describe("pricePrintings with real Sol Ring data", () => {
  const printings = solRingPrintings();
  const prices = solRingPrices();
  const result = pricePrintings(printings, prices);

  it("accounts for every Scryfall printing exactly once", () => {
    const keys = [...result.inStock, ...result.notInStock].map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of printings) expect(keys).toContain(`${p.setCode}#${p.collectorNumber}`);
  });

  it("puts every printing a PH store has in stock among the in-stock ones", () => {
    const stocked = new Set(prices.prints.map((p) => `${p.setCode}#${p.collectorNumber}`));
    expect(new Set(result.inStock.map((p) => p.key))).toEqual(stocked);
    expect(result.notInStock.every((p) => !stocked.has(p.key))).toBe(true);
  });

  it("gives each printing its cheapest copy across finishes, cheapest printing first", () => {
    for (const p of result.inStock) {
      const listings = prices.prints
        .filter((t) => `${t.setCode}#${t.collectorNumber}` === p.key)
        .flatMap((t) => t.listings);
      expect(p.cheapest!.pricePhp).toBe(Math.min(...listings.map((l) => l.pricePhp)));
      expect(p.listings).toBe(listings.length);
    }
    const order = result.inStock.map((p) => p.cheapest!.pricePhp);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("keeps Scryfall's newest-first order for printings not in stock", () => {
    const dates = result.notInStock.map((p) => p.releasedAt ?? "");
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("pricePrintings edge cases", () => {
  const printing = (setCode: string, collectorNumber: string): Printing => ({
    setCode,
    setName: `Set ${setCode}`,
    collectorNumber,
    releasedAt: "2024-01-01",
    rarity: "rare",
    finishes: ["nonfoil", "foil"],
    scryfallUrl: "https://scryfall.com/card/x",
  });
  const print = (setCode: string, number: string, finish: string, prices: number[], language = "EN"): TcgphPrint => ({
    printId: `${setCode}-${number}-${finish}-${language}`,
    setName: `Set ${setCode}`,
    setCode,
    collectorNumber: number,
    finish,
    language,
    url: `https://tcgph.com/cards/${setCode}/${number}`,
    imageUrl: "https://cards.scryfall.io/normal/x.jpg",
    listings: prices.map((pricePhp, i) => ({ listingId: `${setCode}${finish}${i}`, store: `S${i}`, condition: "NM", pricePhp, url: "https://store.example" })),
  });

  it("picks the cheaper finish and labels non-English copies", () => {
    const { inStock } = pricePrintings([printing("CMM", "410")], {
      url: SOL_RING,
      prints: [print("CMM", "410", "Foil", [300]), print("CMM", "410", "Nonfoil", [250], "JP")],
    });
    expect(inStock[0].cheapest).toMatchObject({ pricePhp: 250, finish: "Nonfoil · JP" });
  });

  it("still shows printings TCGph has that Scryfall didn't list", () => {
    const { inStock } = pricePrintings([], { url: SOL_RING, prints: [print("XYZ", "7", "Nonfoil", [99])] });
    expect(inStock).toHaveLength(1);
    expect(inStock[0]).toMatchObject({ setCode: "XYZ", collectorNumber: "7", cheapest: { pricePhp: 99 } });
  });

  it("works when TCGph doesn't list the card at all", () => {
    const result = pricePrintings([printing("CMM", "410")], null);
    expect(result.inStock).toEqual([]);
    expect(result.notInStock.map((p) => p.key)).toEqual(["CMM#410"]);
  });
});
