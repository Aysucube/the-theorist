import { afterEach, describe, expect, it, vi } from "vitest";
import { addProducts, parseTitle, readList, type ShopifyProduct, type ShopifyVariant } from "./collectibat";
import type { StoreCatalog } from "./store-list";

const variant = (id: number, title: string, price: string, available = true, sku = "FRA-415-EN-NF-1"): ShopifyVariant => ({ id, title, price, available, sku });
const product = (title: string, variants: ShopifyVariant[], id = 1): ShopifyProduct => ({ id, title, handle: "the-card", variants });

const catalogOf = (...products: ShopifyProduct[]) => {
  const catalog: StoreCatalog = {};
  addProducts(catalog, products);
  return catalog;
};

describe("parseTitle", () => {
  it.each([
    ["Sol Ring (Surge Foil) [Teenage Mutant Ninja Turtles Commander]", "Sol Ring", "Teenage Mutant Ninja Turtles Commander"],
    ["Mountain (0290) [Tarkir: Dragonstorm]", "Mountain", "Tarkir: Dragonstorm"],
    ["Counterspell (Borderless) (0052) [Marvel Universe: Eternal-Legal]", "Counterspell", "Marvel Universe: Eternal-Legal"],
    ["Jennifer Walters // The Sensational She-Hulk (Borderless) (0388) [Marvel Super Heroes]", "Jennifer Walters // The Sensational She-Hulk", "Marvel Super Heroes"],
  ])("reads %s", (title, name, setName) => {
    expect(parseTitle(title)).toEqual({ name, setName });
  });
});

describe("addProducts", () => {
  it("takes only what's available, with its condition, set, number and price", () => {
    const catalog = catalogOf(
      product("The Theorist, Jace Beleren (Showcase) [Reality Fracture]", [variant(1, "Near Mint", "1200.00"), variant(2, "Lightly Played", "1100.00", false), variant(3, "Heavily Played", "900.00")]),
    );
    expect(catalog["the-theorist-jace-beleren"]).toMatchObject([
      {
        setName: "Reality Fracture",
        setCode: "FRA",
        collectorNumber: "415",
        language: "EN",
        finish: "Nonfoil",
        url: "https://collectibat.com/products/the-card",
        listings: [
          { store: "Collectibat", condition: "NM", conditionLabel: "Near Mint", pricePhp: 1200, url: "https://collectibat.com/products/the-card?variant=1" },
          { condition: "HP", conditionLabel: "Heavily Played", pricePhp: 900 },
        ],
      },
    ]);
    expect(catalog["the-theorist-jace-beleren"][0].listings).toHaveLength(2);
  });

  it("doesn't claim a count, which Shopify doesn't give", () => {
    expect(catalogOf(product("Sol Ring [Foundations]", [variant(1, "Near Mint", "100.00")]))["sol-ring"][0].listings[0].quantity).toBeUndefined();
  });

  it("splits a product's foil and non-foil copies, since they're different printings to a buyer", () => {
    const prints = catalogOf(product("Counterspell [Marvel Universe]", [variant(1, "Near Mint", "655.00"), variant(2, "Near Mint Foil", "1590.00", true, "MAR-52-EN-FO-1")])).counterspell;
    expect(prints.map((p) => [p.finish, p.listings[0].pricePhp, p.listings[0].condition])).toEqual([
      ["Nonfoil", 655, "NM"],
      ["Foil", 1590, "NM"],
    ]);
  });

  it("reads the set and number past extra words in a SKU, and keeps the language", () => {
    const [print] = catalogOf(product("Exalted Sunborn (Showcase Fracture Foil) (Japanese) [Edge of Eternities]", [variant(1, "Near Mint Foil", "900.00", true, "EOE-358-FRACTURE-JA-FO-1")]))["exalted-sunborn"];
    expect(print).toMatchObject({ setCode: "EOE", collectorNumber: "358", language: "JA", finish: "Foil" });
  });

  it("reads a double-faced card's number, which its SKU doubles", () => {
    const [print] = catalogOf(product("Jennifer Walters // The Sensational She-Hulk (Borderless) (0388) [Marvel Super Heroes]", [variant(1, "Near Mint Foil", "900.00", true, "MSH-388//388-EN-FO-1")]))["jennifer-walters"];
    expect(print).toMatchObject({ setCode: "MSH", collectorNumber: "388", language: "EN" });
  });

  it("leaves a card out entirely when nothing is available, and skips tokens", () => {
    expect(catalogOf(product("Sol Ring [Foundations]", [variant(1, "Near Mint", "100.00", false)]), product("Soldier [Foundations Tokens]", [variant(2, "Near Mint", "20.00")]))).toEqual({});
  });

  it("skips what isn't a Magic card: those have no set in their title", () => {
    expect(catalogOf(product("T-007 Zaku II", [variant(1, "Default Title", "50.00", true, null as unknown as string)]))).toEqual({});
  });
});

describe("readList", () => {
  afterEach(() => vi.unstubAllGlobals());

  const full = Array.from({ length: 250 }, (_, i) => product(`Card ${i} [Set]`, [variant(i, "Near Mint", "100.00")], i));
  const respond = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);

  it("reads every page, pausing between them, and stops at a short one", async () => {
    const pages = [full, [product("Sol Ring [Foundations]", [variant(999, "Near Mint", "100.00")], 999)]];
    const fetch = vi.fn(async (url: string) => respond({ products: pages[Number(new URL(url).searchParams.get("page")) - 1] }));
    vi.stubGlobal("fetch", fetch);
    const wait = vi.fn(async () => {});

    const catalog = await readList(wait);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(Object.keys(catalog)).toHaveLength(251);
  });

  it("waits as long as the store asks when it says to slow down, then carries on", async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>().mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "45" } })).mockResolvedValueOnce(respond({ products: [product("Sol Ring [Foundations]", [variant(1, "Near Mint", "100.00")])] }));
    vi.stubGlobal("fetch", fetch);
    const wait = vi.fn(async () => {});

    const catalog = await readList(wait);

    expect(wait).toHaveBeenCalledWith(45_000);
    expect(catalog["sol-ring"]).toHaveLength(1);
  });

  it("gives up for now if the store keeps saying no, rather than saving half a list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(readList(async () => {})).rejects.toThrow("Collectibat: still rate limited");
  });

  it("reports a failed page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(readList(async () => {})).rejects.toThrow("Collectibat: HTTP 503");
  });
});
