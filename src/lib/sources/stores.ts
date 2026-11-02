import { tcgphSlug } from "@/lib/slugs";
import type { TcgphPrices } from "@/lib/types";
import { collectibatPrints } from "./collectibat";
import { coCollectiblesPrints } from "./co-collectibles";
import { dragonsHoardPrints } from "./dragons-hoard";
import { reportSourceError } from "./http";
import { getPrices } from "./tcgph";

// TCGph covers most Philippine stores. These three aren't on it, so what they
// have is added to what it finds, and from there on a store is a store.

/** Adds the other stores' copies of a card to TCGph's, or stands in if TCGph doesn't know it. */
export async function withStoreLists(prices: TcgphPrices | null, name: string): Promise<TcgphPrices | null> {
  // One store being down shouldn't cost a card its other prices.
  const dragonsHoard = dragonsHoardPrints(name).catch((error) => {
    reportSourceError("Dragon's Hoard price", error);
    return [];
  });
  const found = (await Promise.all([coCollectiblesPrints(name), collectibatPrints(name), dragonsHoard])).flat();
  if (found.length === 0) return prices;
  return { url: prices?.url ?? found[0].url, prints: [...(prices?.prints ?? []), ...found] };
}

/** Every Philippine price for a card, by its full name. */
export async function getStorePrices(name: string): Promise<TcgphPrices | null> {
  return withStoreLists(await getPrices(tcgphSlug(name)), name);
}
