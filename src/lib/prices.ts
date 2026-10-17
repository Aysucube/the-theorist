import { edhrecSlug, tcgphSlug } from "@/lib/slugs";
import { getCardStats } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
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

/** Commanders named in a hover card. */
const PREVIEW_COMMANDERS = 3;

/**
 * What a hover card shows: the cheapest PH copy and its artwork (TCGph), the
 * card's colors and rules text (Scryfall), and how decks use it plus similar
 * cards (EDHREC). Price and card details are fetched side by side, and any one
 * source failing still leaves the rest. Every lookup is cached.
 */
export async function getCardPreview(name: string): Promise<CardPreview> {
  const [priced, lookup] = await Promise.all([
    getPriceSummary(name).then(
      (summary) => ({ summary, failed: false }),
      (error) => {
        reportSourceError("preview price", error);
        return { summary: null, failed: true };
      },
    ),
    findCard(name).catch((error) => {
      reportSourceError("preview card", error);
      return null;
    }),
  ]);

  const card = lookup?.card;
  const stats = card
    ? await getCardStats(edhrecSlug(card.name, card.layout)).catch((error) => {
        reportSourceError("preview decks", error);
        return null;
      })
    : null;

  return {
    name: card?.name ?? name,
    imageUrl: priced.summary?.imageUrl ?? card?.imageUrl,
    cheapest: priced.summary?.cheapest,
    stores: priced.summary?.stores ?? 0,
    priceUnavailable: priced.failed || undefined,
    typeLine: card?.typeLine,
    manaCost: card?.manaCost,
    colorIdentity: card?.colorIdentity,
    oracleText: card?.oracleText,
    decks: stats
      ? {
          numDecks: stats.numDecks,
          inclusion: stats.inclusion,
          topCommanders: stats.topCommanders.slice(0, PREVIEW_COMMANDERS).map((c) => c.name),
        }
      : undefined,
    similar: stats?.similar,
  };
}
