import { afterEach, describe, expect, it, vi } from "vitest";
import { dragonsHoardPrints, parseTitle, printsOf, type Suggestion } from "./dragons-hoard";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const product = (over: Partial<Suggestion>): Suggestion => ({
  id: 1,
  title: "Sol Ring (Borderless) [CMM - 703]",
  url: "/products/sol-ring-borderless-commander-masters-503402?_pos=1&_sid=abc",
  type: "Magic: The Gathering Singles",
  available: true,
  price_min: "653.00",
  price_max: "653.00",
  tags: ["Artifact", "Commander Masters", "Magic", "Uncommon"],
  ...over,
});

describe("parseTitle", () => {
  it.each([
    ["Rhystic Study [WOT - 25]", "Rhystic Study", "WOT", "25"],
    ["Rhystic Study (Anime Borderless) [WOT - 71]", "Rhystic Study", "WOT", "71"],
    ["Jennifer Walters (Borderless) (0328) [MSH - 0328]", "Jennifer Walters", "MSH", "328"],
    ["Fire // Ice [DMR - 215]", "Fire // Ice", "DMR", "215"],
    ["Sol Ring - Human (0410) [LTC - 410]", "Sol Ring", "LTC", "410"],
    ["Forest (0193) [HOB - 193]", "Forest", "HOB", "193"],
  ])("reads %s", (title, name, setCode, collectorNumber) => {
    expect(parseTitle(title)).toEqual({ name, setCode, collectorNumber });
  });

  it("gives up on a title with no set code", () => {
    expect(parseTitle("Shadow Urchin [Lorwyn Eclipsed Promos]")).toBeNull();
  });
});

describe("printsOf", () => {
  it("makes a listing from a product with one price", () => {
    expect(printsOf([product({})], "Sol Ring")).toEqual([
      {
        printId: "dragons-hoard-1",
        setName: "Commander Masters",
        setCode: "CMM",
        collectorNumber: "703",
        finish: undefined,
        url: "https://dhph.store/products/sol-ring-borderless-commander-masters-503402",
        listings: [
          {
            listingId: "dragons-hoard-1",
            store: "Dragon's Hoard",
            condition: "NM",
            conditionLabel: "Near Mint",
            pricePhp: 653,
            url: "https://dhph.store/products/sol-ring-borderless-commander-masters-503402",
          },
        ],
      },
    ]);
  });

  it("shows the lowest of two prices, and says it's a range, without claiming a finish", () => {
    const [print] = printsOf([product({ price_min: "653.00", price_max: "1717.00" })], "Sol Ring");
    expect(print.finish).toBe("Foil or nonfoil");
    expect(print.listings[0]).toMatchObject({ pricePhp: 653, conditionLabel: "Near Mint, ₱653 to ₱1,717 by finish" });
  });

  it("knows a foil when the title says so", () => {
    expect(printsOf([product({ title: "Sol Ring (Surge Foil) [PIP - 767]" })], "Sol Ring")[0].finish).toBe("Foil");
    expect(printsOf([product({ title: "Heroic Intervention (Foil Etched) [CMM - 563]" })], "Heroic Intervention")[0].finish).toBe("Foil");
  });

  it("keeps only the card asked for, since the search is loose", () => {
    const products = [product({ title: "Negate [TMT - 47]" }), product({ title: "Sol Ring Art Card [ASECL - 45]" }), product({ title: "Sol Ring [PIP - 259]" })];
    expect(printsOf(products, "Sol Ring").map((p) => p.setCode)).toEqual(["PIP"]);
  });

  it("matches double-faced and split cards by their front face", () => {
    expect(printsOf([product({ title: "Jennifer Walters (Borderless) (0328) [MSH - 0328]" })], "Jennifer Walters // The Sensational She-Hulk")).toHaveLength(1);
    expect(printsOf([product({ title: "Fire // Ice [DMR - 215]" })], "Fire // Ice")).toHaveLength(1);
    expect(printsOf([product({ title: "Fire Sages [TLA - 136]" })], "Fire // Ice")).toEqual([]);
  });

  it("leaves out what's sold out, and other games", () => {
    expect(printsOf([product({ available: false }), product({ type: "Pokemon Singles" })], "Sol Ring")).toEqual([]);
  });

  it("falls back on the set code when no tag names the set", () => {
    expect(printsOf([product({ tags: ["Artifact", "Magic", "Rare"] })], "Sol Ring")[0].setName).toBe("CMM");
  });
});

describe("dragonsHoardPrints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the store about the card by name", async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify({ resources: { results: { products: [product({})] } } })));
    vi.stubGlobal("fetch", fetch);

    const prints = await dragonsHoardPrints("Sol Ring");

    expect(prints.map((p) => p.setCode)).toEqual(["CMM"]);
    expect(fetch.mock.calls[0][0]).toContain("q=Sol%20Ring");
    expect(fetch.mock.calls[0][0]).toContain("unavailable_products]=hide");
  });

  // Last in this file: it leaves the store paused for a minute.
  it("reports trouble and leaves the store alone for a while", async () => {
    const fetch = vi.fn(async () => new Response("local_rate_limited", { status: 429 }));
    vi.stubGlobal("fetch", fetch);

    await expect(dragonsHoardPrints("Sol Ring")).rejects.toThrow("Dragon's Hoard: HTTP 429");
    await expect(dragonsHoardPrints("Sol Ring")).rejects.toThrow("paused");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
