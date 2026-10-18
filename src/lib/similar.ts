// Cards with almost the same effect as a given card, for the card page's
// "Similar cards" gallery: EDHREC's similar list, with each card's cheapest
// PH copy and artwork.
import { getPriceSummary } from "@/lib/prices";
import { edhrecSlug } from "@/lib/slugs";
import { getCardStats } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { findCard } from "@/lib/sources/scryfall";
import type { ListingBrief, ScryfallCard } from "@/lib/types";

export interface SimilarCard {
  name: string;
  imageUrl?: string;
  cheapest?: ListingBrief;
  stores: number;
  /** TCGph couldn't be reached, so a missing price means "unknown". */
  priceUnavailable?: boolean;
}

async function describe(name: string): Promise<SimilarCard> {
  let summary = null;
  let priceUnavailable: boolean | undefined;
  try {
    summary = await getPriceSummary(name);
  } catch (error) {
    reportSourceError("similar price", error);
    priceUnavailable = true;
  }
  // The cheapest printing's art comes with the price; otherwise ask Scryfall (cached, paced).
  const imageUrl = summary?.imageUrl ?? (await findCard(name).catch(() => null))?.card.imageUrl;
  return { name, imageUrl, cheapest: summary?.cheapest, stores: summary?.stores ?? 0, priceUnavailable };
}

/** EDHREC's similar cards for `card`, priced, in EDHREC's order. Empty if EDHREC has none. */
export async function getSimilarCards(card: ScryfallCard): Promise<SimilarCard[]> {
  const stats = await getCardStats(edhrecSlug(card.name, card.layout));
  const names = (stats?.similar ?? []).filter((name) => name !== card.name);
  return Promise.all(names.map(describe));
}
