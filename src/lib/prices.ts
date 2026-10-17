import { tcgphSlug } from "@/lib/slugs";
import { findCard } from "@/lib/sources/scryfall";
import { getPrices, summarizePrices } from "@/lib/sources/tcgph";
import type { TcgphSummary } from "@/lib/types";

/**
 * Cheapest Philippine price for a card name. Tries TCGph with the name as
 * given first. Only if TCGph doesn't know it (EDHREC and deck lists name
 * double-faced cards by their front face, "Agadeem's Awakening", or the name
 * is misspelled) does it ask Scryfall for the full name and try again.
 * Scryfall allows only 2 name lookups a second, so skipping it matters when
 * pricing a whole deck. Every lookup is cached.
 */
export async function getPriceSummary(name: string): Promise<TcgphSummary | null> {
  const direct = await getPrices(tcgphSlug(name));
  if (direct) return summarizePrices(direct);

  const lookup = await findCard(name);
  if (!lookup || tcgphSlug(lookup.card.name) === tcgphSlug(name)) return null;
  const prices = await getPrices(tcgphSlug(lookup.card.name));
  return prices && summarizePrices(prices);
}
