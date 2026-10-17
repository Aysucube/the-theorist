import { describe, expect, it } from "vitest";
import type { DeckCard } from "./deck";
import { orderText, planCheapest, planFewestStores } from "./shopping";
import type { PriceResponse } from "./types";

const offer = (store: string, pricePhp: number) => ({
  store,
  pricePhp,
  condition: "NM",
  url: `https://${store.toLowerCase()}.example/card`,
});

/** A card's price lookup with the given (store, price) offers. */
function at(...offers: [string, number][]): PriceResponse {
  const byStore = offers.map(([store, price]) => offer(store, price)).sort((a, b) => a.pricePhp - b.pricePhp);
  return { found: true, url: "https://tcgph.com/card/x", cheapest: byStore[0], stores: byStore.length, listings: byStore.length, byStore };
}

const deck = (...names: string[]): DeckCard[] => names.map((name) => ({ name, qty: 1 }));
const storesOf = (plan: { stops: { store: string }[] }) => plan.stops.map((s) => s.store).sort();

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
    const z = plan.stops.find((s) => s.store === "Z")!;
    expect(z.items.map((i) => i.name)).toEqual(["C", "A"]);
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
    });
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
        "Sol Ring": { ...at(["HMO", 90]), byStore: [{ ...offer("HMO", 90), printing: "CMM #410 · Foil" }] } as PriceResponse,
        Island: at(["HMO", 19]),
      },
    );
    expect(orderText(plan.stops[0])).toBe(
      ["Order for HMO:", "10x Island (NM) - ₱19 each", "1x Sol Ring (CMM #410 · Foil, NM) - ₱90", "Total: ₱280 (11 cards)"].join("\n"),
    );
  });
});
