import { tcgphSlug } from "@/lib/slugs";
import { findCard } from "@/lib/sources/scryfall";
import { getPrices, summarizePrices } from "@/lib/sources/tcgph";
import type { TcgphSummary } from "@/lib/types";

/**
 * Cheapest Philippine price for a card name as EDHREC lists it. EDHREC names
 * double-faced cards by their front face ("Agadeem's Awakening") but TCGph's
 * address uses both faces, so the name goes through Scryfall first. Both
 * lookups are cached, so repeat checks cost no outside requests.
 */
export async function getPriceSummary(name: string): Promise<TcgphSummary | null> {
  const lookup = await findCard(name);
  const prices = await getPrices(tcgphSlug(lookup?.card.name ?? name));
  return prices && summarizePrices(prices);
}
