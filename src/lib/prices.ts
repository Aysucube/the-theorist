import { tcgphSlug } from "@/lib/slugs";
import { findCard } from "@/lib/sources/scryfall";
import { getPrices, summarizePrices } from "@/lib/sources/tcgph";
import type { CardPreview, TcgphSummary } from "@/lib/types";

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

/**
 * What a hover card shows: the cheapest PH copy and its artwork. Falls back
 * to Scryfall for the image when no PH store has the card.
 */
export async function getCardPreview(name: string): Promise<CardPreview> {
  const summary = await getPriceSummary(name);
  const preview: CardPreview = {
    name,
    imageUrl: summary?.imageUrl,
    cheapest: summary?.cheapest,
    stores: summary?.stores ?? 0,
  };
  if (!preview.imageUrl) {
    const lookup = await findCard(name).catch(() => null);
    preview.imageUrl = lookup?.card.imageUrl;
    if (lookup) preview.name = lookup.card.name;
  }
  return preview;
}
