import { connection } from "next/server";
import { tcgphSlug } from "@/lib/slugs";
import type { TcgphPrices } from "@/lib/types";
import { collectibatPrints } from "./collectibat";
import { coCollectiblesPrints } from "./co-collectibles";
import { getPrices } from "./tcgph";

// TCGph covers most Philippine stores. These two aren't on it, so their lists
// are added to what it finds, and from there on a store is a store.

/** Adds the other stores' copies of a card to TCGph's, or stands in if TCGph doesn't know it. */
export async function withStoreLists(prices: TcgphPrices | null, name: string): Promise<TcgphPrices | null> {
  // The lists change with time, so a page can't be prerendered with them.
  await connection();
  const found = (await Promise.all([coCollectiblesPrints(name), collectibatPrints(name)])).flat();
  if (found.length === 0) return prices;
  return { url: prices?.url ?? found[0].url, prints: [...(prices?.prints ?? []), ...found] };
}

/** Every Philippine price for a card, by its full name. */
export async function getStorePrices(name: string): Promise<TcgphPrices | null> {
  return withStoreLists(await getPrices(tcgphSlug(name)), name);
}
