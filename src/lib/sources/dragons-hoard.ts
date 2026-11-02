import { cacheLife } from "next/cache";
import { formatPhp } from "@/lib/format";
import type { TcgphPrint } from "@/lib/types";
import { SourceError, sourceFetch } from "./http";
import { storeKey } from "./store-list";
import { createThrottle } from "./throttle";

// Dragon's Hoard is a Shopify store with over 30,000 singles, too many to read
// through at the few pages a minute Shopify allows, and little of it is in
// stock. So it's asked one card at a time, like TCGph, through the search behind
// its own search box, which leaves out what's sold out. Prices are in pesos.
//
// That search gives a product's lowest and highest price but not which copy is
// which, and most products hold a non-foil and a foil. Usually both are in stock
// and the non-foil is cheaper, but not always, so a product with two prices
// shows the lowest and says it's a range.
const STORE = "Dragon's Hoard";
const SITE = "https://dhph.store";
const SEARCH = `${SITE}/search/suggest.json?resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=hide&resources[options][fields]=title`;
// A price lookup shouldn't hang on one store.
const TIMEOUT_MS = 5_000;

// 2 searches a second held up over 40 in a row. After any trouble, leave the store alone for a minute.
const throttle = createThrottle({ spacingMs: { search: 500 }, backOffMs: 60_000, maxWaitMs: 20_000 });

/** One product as the search has it. */
export interface Suggestion {
  id: number;
  title: string;
  url: string;
  type: string;
  available: boolean;
  price_min: string;
  price_max: string;
  tags: string[];
}

/** What a tag can be besides the set: the rest are its rarity and card types. */
const NOT_A_SET = /^(?:Magic|Common|Uncommon|Rare|Mythic|Special|Artifact|Battle|Creature|Enchantment|Instant|Land|Planeswalker|Sorcery)$/;

/** "Jennifer Walters (Borderless) (0328) [MSH - 0328]" is a Jennifer Walters, number 328 of MSH. */
export function parseTitle(title: string) {
  const match = title.match(/^(.*?)\s*\[([A-Z0-9]+) - ([^\]]+)\]\s*$/);
  if (!match) return null;
  const [, rest, setCode, number] = match;
  return { name: rest.replace(/\s*\([^)]*\)/g, "").replace(/ - .*$/, "").trim(), setCode, collectorNumber: number.replace(/^0+(?=\d)/, "") };
}

/** The search is loose ("Counterspell" finds Negate), so only the card itself counts. */
export function printsOf(products: Suggestion[], name: string): TcgphPrint[] {
  return products.flatMap((product): TcgphPrint[] => {
    const parsed = parseTitle(product.title);
    if (!parsed || !product.available || !/Magic/.test(product.type) || storeKey(parsed.name) !== storeKey(name)) return [];
    const { setCode, collectorNumber } = parsed;
    const [low, high] = [Number(product.price_min), Number(product.price_max)];
    const url = `${SITE}${product.url.split("?")[0]}`;
    return [
      {
        printId: `dragons-hoard-${product.id}`,
        setName: product.tags.find((tag) => !NOT_A_SET.test(tag)) ?? setCode,
        setCode,
        collectorNumber,
        finish: low !== high ? "Foil or nonfoil" : /\bFoil\b/.test(product.title) ? "Foil" : undefined,
        url,
        listings: [
          {
            listingId: `dragons-hoard-${product.id}`,
            store: STORE,
            condition: "NM",
            conditionLabel: low === high ? "Near Mint" : `Near Mint, ${formatPhp(low)} to ${formatPhp(high)} by finish`,
            pricePhp: low,
            url,
          },
        ],
      },
    ];
  });
}

/** The copies of a card in stock, by its name, in full if that's known: a split card's front half alone finds other cards. */
export async function dragonsHoardPrints(name: string): Promise<TcgphPrint[]> {
  "use cache: remote";
  cacheLife("hours");

  try {
    await throttle.wait("search");
  } catch (e) {
    throw new SourceError(STORE, e instanceof Error ? e.message : "busy");
  }
  const res = await sourceFetch(STORE, `${SEARCH}&q=${encodeURIComponent(name)}`, "application/json", undefined, TIMEOUT_MS).catch((error) => {
    throttle.backOff();
    throw error;
  });
  if (!res.ok) {
    throttle.backOff();
    throw new SourceError(STORE, `HTTP ${res.status}`);
  }
  const body = (await res.json()) as { resources?: { results?: { products?: Suggestion[] } } };
  return printsOf(body.resources?.results?.products ?? [], name);
}
