import { describe, expect, it } from "vitest";
import type { DeckCard } from "./deck";
import { cheapestPhp, orderText, planCheapest, planFewestStores, tickKey } from "./shopping";
import type { ListingBrief, PriceResponse, StoreOffer } from "./types";

/** Plenty, for tests that aren't about stock. */
const PLENTY = 20;

const offer = (store: string, pricePhp: number, quantity = PLENTY): ListingBrief => ({
  store,
  pricePhp,
  quantity,
  condition: "NM",
  url: `https://${store.toLowerCase()}.example/card/${pricePhp}`,
});

function lookup(byStore: StoreOffer[]): PriceResponse {
  byStore.sort((a, b) => a.pricePhp - b.pricePhp);
  const listings = byStore.reduce((sum, s) => sum + (s.listings?.length ?? 1), 0);
  return { found: true, url: "https://tcgph.com/card/x", cheapest: byStore[0], stores: byStore.length, listings, byStore };
}

/** A card's price lookup with the given (store, price) offers, each with plenty of copies. */
function at(...offers: [string, number][]): PriceResponse {
  return lookup(offers.map(([store, price]) => offer(store, price)));
}

/** A card's price lookup from each store's listings as [price, copies], cheapest first. */
function stocked(stores: Record<string, [number, number][]>): PriceResponse {
  return lookup(
    Object.entries(stores).map(([store, rows]) => {
      const listings = rows.map(([price, copies]) => offer(store, price, copies));
      return { ...listings[0], stock: rows.reduce((sum, [, copies]) => sum + copies, 0), listings };
    }),
  );
}

const deck = (...names: string[]): DeckCard[] => names.map((name) => ({ name, qty: 1 }));
const storesOf = (plan: { stops: { store: string }[] }) => plan.stops.map((s) => s.store).sort();
const stopAt = (plan: ReturnType<typeof planFewestStores>, store: string) => plan.stops.find((s) => s.store === store)!;

describe("cheapestPhp", () => {
  it("is a card's cheapest copy anywhere", () => {
    expect(cheapestPhp(at(["HMO", 120], ["Vault", 150]))).toBe(120);
  });

  it("is unknown without a price", () => {
    expect(cheapestPhp(undefined)).toBeUndefined();
    expect(cheapestPhp("error")).toBeUndefined();
    expect(cheapestPhp({ found: false })).toBeUndefined();
    expect(cheapestPhp(lookup([]))).toBeUndefined();
  });
});

describe("planFewestStores", () => {
  it("sends you to one store that has everything, even if splitting would be cheaper", () => {
    const prices = {
      A: at(["Vault", 10], ["HMO", 15]),
      B: at(["Vault", 10], ["HMO", 15]),
      C: at(["HMO", 50]),
    };
    const plan = planFewestStores(deck("A", "B", "C"), prices);

    expect(storesOf(plan)).toEqual(["HMO"]);
    expect(plan.totalPhp).toBe(80);
    expect(planCheapest(deck("A", "B", "C"), prices).totalPhp).toBe(70);
  });

  it("picks the cheaper store when several have everything", () => {
    const plan = planFewestStores(deck("A", "B"), {
      A: at(["HMO", 20], ["GGH", 10]),
      B: at(["HMO", 20], ["GGH", 15]),
    });
    expect(storesOf(plan)).toEqual(["GGH"]);
    expect(plan.totalPhp).toBe(25);
  });

  it("uses the cheapest pair of stores when no single store has everything", () => {
    const plan = planFewestStores(deck("A", "B", "C"), {
      A: at(["X", 10], ["Y", 12]),
      B: at(["X", 30], ["Z", 5]),
      C: at(["Y", 40], ["Z", 8]),
    });
    // Every pair covers all three cards: {X,Z} = 10+5+8 = 23, {Y,Z} = 12+5+8 = 25, {X,Y} = 10+30+40 = 80.
    expect(storesOf(plan)).toEqual(["X", "Z"]);
    expect(plan.totalPhp).toBe(23);
  });

  it("buys each card at the cheaper of the chosen stores", () => {
    const plan = planFewestStores(deck("A", "B", "C"), {
      A: at(["X", 10], ["Z", 9]),
      B: at(["X", 30]),
      C: at(["Z", 8]),
    });
    expect(stopAt(plan, "Z").items.map((i) => i.name)).toEqual(["C", "A"]);
  });

  it("falls back to covering the most cards per store when more than three stores are needed", () => {
    const plan = planFewestStores(deck("A", "B", "C", "D", "E"), {
      A: at(["P", 1]),
      B: at(["Q", 1]),
      C: at(["R", 1]),
      D: at(["S", 1], ["P", 2]),
      E: at(["S", 1]),
    });
    expect(storesOf(plan)).toEqual(["P", "Q", "R", "S"]);
    expect(plan.stops[0].store).toBe("S"); // most cards first
  });

  it("lists cards cheapest first and multiplies by quantity", () => {
    const plan = planFewestStores(
      [
        { name: "Island", qty: 10 },
        { name: "Sol Ring", qty: 1 },
      ],
      { Island: at(["HMO", 19]), "Sol Ring": at(["HMO", 90]) },
    );
    expect(plan.stops[0].items.map((i) => [i.name, i.lineTotalPhp])).toEqual([
      ["Island", 190],
      ["Sol Ring", 90],
    ]);
    expect(plan.totalPhp).toBe(280);
  });

  it("reports cards no store has and ignores cards not priced yet", () => {
    const plan = planFewestStores(deck("A", "Gone", "Unchecked"), {
      A: at(["HMO", 10]),
      Gone: { found: false },
    });
    expect(plan.unavailable).toEqual(["Gone"]);
    expect(plan.stops.flatMap((s) => s.items.map((i) => i.name))).toEqual(["A"]);
  });

  it("is empty when nothing is in stock", () => {
    expect(planFewestStores(deck("Gone"), { Gone: { found: false } })).toEqual({
      stops: [],
      totalPhp: 0,
      unavailable: ["Gone"],
      short: [],
    });
  });
});

describe("planFewestStores with limited stock", () => {
  it("doesn't count a store that has too few copies as having the card", () => {
    // HMO is cheaper for both, but has only 5 of the 10 Islands.
    const plan = planFewestStores(
      [
        { name: "Island", qty: 10 },
        { name: "Sol Ring", qty: 1 },
      ],
      {
        Island: stocked({ HMO: [[19, 5]], GGH: [[25, 12]] }),
        "Sol Ring": stocked({ HMO: [[90, 1]], GGH: [[100, 2]] }),
      },
    );

    expect(storesOf(plan)).toEqual(["GGH"]);
    expect(plan.totalPhp).toBe(10 * 25 + 100);
    const island = stopAt(plan, "GGH").items.find((i) => i.name === "Island")!;
    expect(island).toMatchObject({ qty: 10, stock: 12, alsoAt: [] });
  });

  it("adds up a store's listings to judge its stock", () => {
    // Neither of HMO's listings has 10 Islands, but together they do.
    const plan = planFewestStores([{ name: "Island", qty: 10 }], {
      Island: stocked({ HMO: [[19, 6], [21, 4]], GGH: [[30, 10]] }),
    });
    expect(storesOf(plan)).toEqual(["HMO"]);
    expect(plan.totalPhp).toBe(6 * 19 + 4 * 21);
  });

  it("splits a card between two stores when no store has enough", () => {
    const prices = {
      Island: stocked({ HMO: [[19, 6]], GGH: [[20, 7]] }),
      "Sol Ring": stocked({ HMO: [[90, 1]] }),
    };
    const plan = planFewestStores(
      [
        { name: "Island", qty: 10 },
        { name: "Sol Ring", qty: 1 },
      ],
      prices,
    );

    expect(storesOf(plan)).toEqual(["GGH", "HMO"]);
    expect(plan.short).toEqual([]);
    const atHmo = stopAt(plan, "HMO").items.find((i) => i.name === "Island")!;
    const atGgh = stopAt(plan, "GGH").items.find((i) => i.name === "Island")!;
    expect(atHmo).toMatchObject({ qty: 6, lineTotalPhp: 6 * 19, alsoAt: [{ store: "GGH", qty: 4 }] });
    expect(atGgh).toMatchObject({ qty: 4, lineTotalPhp: 4 * 20, alsoAt: [{ store: "HMO", qty: 6 }] });
    expect(plan.totalPhp).toBe(6 * 19 + 4 * 20 + 90);

    // Each half gets its own tick and its own line in that store's order.
    expect(tickKey(atHmo, "HMO")).not.toBe(tickKey(atGgh, "GGH"));
    expect(orderText(stopAt(plan, "GGH"))).toBe(
      ["Order for GGH:", "4x Island (NM) - ₱20 each", "Total: ₱80 (4 cards)"].join("\n"),
    );
  });

  it("buys every copy there is when all the stores together have too few", () => {
    const plan = planFewestStores([{ name: "Island", qty: 10 }], {
      Island: stocked({ HMO: [[19, 3]], GGH: [[20, 4]] }),
    });
    expect(plan.short).toEqual([{ name: "Island", qty: 10, inStock: 7 }]);
    expect(plan.stops.flatMap((s) => s.items).reduce((sum, i) => sum + i.qty, 0)).toBe(7);
    expect(plan.totalPhp).toBe(3 * 19 + 4 * 20);
  });

  it("still fills a card from many stores when more than three are needed", () => {
    const plan = planFewestStores([{ name: "Relentless Rats", qty: 5 }], {
      "Relentless Rats": stocked({ P: [[10, 1]], Q: [[11, 1]], R: [[12, 1]], S: [[13, 1]], T: [[14, 2]], U: [[15, 1]] }),
    });
    // Four stores is the fewest that hold five copies: T has two.
    expect(plan.stops).toHaveLength(4);
    expect(plan.stops.flatMap((s) => s.items).reduce((sum, i) => sum + i.qty, 0)).toBe(5);
    expect(plan.short).toEqual([]);
  });

  it("treats a listing with no readable count as one copy", () => {
    const plan = planFewestStores([{ name: "Island", qty: 2 }], {
      Island: lookup([{ ...offer("HMO", 19), quantity: undefined }, offer("GGH", 25, 2)]),
    });
    expect(storesOf(plan)).toEqual(["GGH"]);
  });
});

describe("buying several copies at one store", () => {
  // HMO's cheapest Islands run out after 5, so the next 3 come from its ₱35 listing.
  const prices = { Island: stocked({ HMO: [[30, 5], [35, 10]], GGH: [[32, 10]] }) };
  const island: DeckCard[] = [{ name: "Island", qty: 8 }];

  it("fills up from the store's next-cheapest listing", () => {
    const plan = planFewestStores(island, prices);
    expect(storesOf(plan)).toEqual(["HMO"]); // 5×30 + 3×35 = 255 beats GGH's 8×32 = 256
    const [item] = plan.stops[0].items;
    expect(item.parts.map((p) => [p.offer.pricePhp, p.qty])).toEqual([
      [30, 5],
      [35, 3],
    ]);
    expect(item).toMatchObject({ qty: 8, lineTotalPhp: 255, stock: 15 });
    expect(orderText(plan.stops[0])).toBe(
      ["Order for HMO:", "5x Island (NM) - ₱30 each", "3x Island (NM) - ₱35 each", "Total: ₱255 (8 cards)"].join("\n"),
    );
  });

  it("prices the cheapest plan from the cheapest copies anywhere", () => {
    const plan = planCheapest(island, prices);
    expect(plan.totalPhp).toBe(5 * 30 + 3 * 32);
    expect(storesOf(plan)).toEqual(["GGH", "HMO"]);
  });

  it("merges listings of the same copy at the same price into one line", () => {
    const plan = planFewestStores(island, { Island: stocked({ HMO: [[30, 5], [30, 5]] }) });
    expect(plan.stops[0].items[0].parts.map((p) => [p.offer.pricePhp, p.qty])).toEqual([[30, 8]]);
  });
});

describe("tickKey", () => {
  it("follows the card unless the card is split between stores", () => {
    const plan = planFewestStores([{ name: "Island", qty: 4 }, { name: "Sol Ring", qty: 1 }], {
      Island: stocked({ HMO: [[19, 2]], GGH: [[20, 2]] }),
      "Sol Ring": stocked({ HMO: [[90, 1]] }),
    });
    const hmo = stopAt(plan, "HMO");
    expect(hmo.items.map((i) => tickKey(i, "HMO")).sort()).toEqual(["Island @ HMO", "Sol Ring"]);
  });
});

describe("orderText", () => {
  it("writes a message a store can fill", () => {
    const plan = planFewestStores(
      [
        { name: "Sol Ring", qty: 1 },
        { name: "Island", qty: 10 },
      ],
      {
        "Sol Ring": lookup([{ ...offer("HMO", 90), printing: "CMM #410 · Foil" }]),
        Island: at(["HMO", 19]),
      },
    );
    expect(orderText(plan.stops[0])).toBe(
      ["Order for HMO:", "10x Island (NM) - ₱19 each", "1x Sol Ring (CMM #410 · Foil, NM) - ₱90", "Total: ₱280 (11 cards)"].join("\n"),
    );
  });
});
