import type { TcgphListing, TcgphPrint } from "@/lib/types";
import { SourceError, sourceFetch } from "./http";
import { storeKey, storeList, type StoreCatalog } from "./store-list";

// Collectibat is a Shopify store, so its collection has a public product feed,
// 250 products a page, which robots.txt allows. Prices are in pesos. Shopify says
// whether a copy is available but not how many, so a listing has no quantity.
// The feed answers only a few requests a minute before asking us to wait, so
// it's read slowly in the background, and only every few hours.
const STORE = "Collectibat";
const SITE = "https://collectibat.com";
const FEED = `${SITE}/collections/mtg-singles/products.json?limit=250`;
const PAGE_SIZE = 250;
// The collection is about 14 pages. Stops a change at Shopify from looping forever.
const MAX_PAGES = 40;
const PAUSE_BETWEEN_PAGES_MS = 20_000;
/** How long to wait when told to slow down without being told for how long. */
const DEFAULT_WAIT_S = 60;
/** How many times one page may be told to wait before giving up for now. */
const MAX_WAITS = 6;

export interface ShopifyVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  available: boolean;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  variants: ShopifyVariant[];
}

/** Short codes for conditions, as TCGph shows them. */
const CONDITIONS: Record<string, string> = { "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", Damaged: "D" };

/** "Sol Ring (Surge Foil) [Teenage Mutant Ninja Turtles Commander]" is a Sol Ring from that set. */
export function parseTitle(title: string) {
  const setName = title.match(/\[([^\]]*)\]\s*$/)?.[1] ?? "";
  const name = title.replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s*\([^)]*\)/g, "").trim();
  return { name, setName };
}

/** SKUs run set, number, any extra words, language, finish, condition: "FRA-415-EN-FO-1". A double-faced card's number is doubled: "MSH-388//388-EN-FO-1". */
function parseSku(sku: string | null) {
  const parts = (sku ?? "").split("-");
  return parts.length >= 5 ? { setCode: parts[0], collectorNumber: parts[1].split("//")[0], language: parts[parts.length - 3] } : {};
}

/** Adds what's available to the list: each product is a printing, and each condition and finish of it a variant. */
export function addProducts(catalog: StoreCatalog, products: ShopifyProduct[]) {
  for (const product of products) {
    const { name, setName } = parseTitle(product.title);
    // No set means it isn't a Magic card: a few Gundam cards sit in this collection.
    if (!setName || /\bTokens$/.test(setName)) continue;
    const url = `${SITE}/products/${product.handle}`;
    // A product can be foil, non-foil or both, and those are different printings to a buyer.
    for (const foil of [false, true]) {
      const variants = product.variants.filter((v) => v.available && /\bFoil$/.test(v.title) === foil);
      if (variants.length === 0) continue;
      const listings = variants.map((variant): TcgphListing => {
        const label = variant.title.replace(/\s*Foil$/, "");
        return {
          listingId: `collectibat-${variant.id}`,
          store: STORE,
          condition: CONDITIONS[label] ?? label,
          conditionLabel: label,
          pricePhp: Number(variant.price),
          url: `${url}?variant=${variant.id}`,
        };
      });
      const print: TcgphPrint = { printId: `collectibat-${product.id}-${foil ? "foil" : "nonfoil"}`, setName, ...parseSku(variants[0].sku), finish: foil ? "Foil" : "Nonfoil", url, listings };
      (catalog[storeKey(name)] ??= []).push(print);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One page of the feed, waiting as long as the store asks whenever it says to slow down. */
async function fetchPage(page: number, wait: (ms: number) => Promise<unknown>): Promise<ShopifyProduct[]> {
  for (let waits = 0; waits <= MAX_WAITS; waits++) {
    const res = await sourceFetch(STORE, `${FEED}&page=${page}`, "application/json");
    if (res.status === 429) {
      await wait((Number(res.headers.get("retry-after")) || DEFAULT_WAIT_S) * 1000);
      continue;
    }
    if (!res.ok) throw new SourceError(STORE, `HTTP ${res.status}`);
    return ((await res.json()) as { products: ShopifyProduct[] }).products;
  }
  throw new SourceError(STORE, "still rate limited");
}

export async function readList(wait: (ms: number) => Promise<unknown> = sleep): Promise<StoreCatalog> {
  const catalog: StoreCatalog = {};
  for (let page = 1; page <= MAX_PAGES; page++) {
    const products = await fetchPage(page, wait);
    addProducts(catalog, products);
    if (products.length < PAGE_SIZE) break;
    await wait(PAUSE_BETWEEN_PAGES_MS);
  }
  return catalog;
}

export const collectibatPrints = storeList("collectibat", () => readList());
