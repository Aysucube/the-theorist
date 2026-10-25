// Philippine deals: a printing a PH store sells for well under its market
// price. The market price (TCGplayer, US dollars) is for one printing, so it's
// compared with the cheapest non-foil copy of that same set on TCGph, not with
// a cheaper reprint. Pure, so it's easy to test.
import type { UsdRate } from "./fx";
import type { ListingBrief, PriceResponse } from "./types";

/** How far under market a PH copy must be to count: at least 20% cheaper. */
export const DEAL_DISCOUNT = 0.2;

export interface Deal {
  /** The PH copy: its price, store and link. */
  listing: ListingBrief;
  /** The market price in pesos. */
  marketPhp: number;
  /** How much cheaper, as a share of the market price (0.25 = 25% under). */
  savings: number;
}

/** The PH deal on a printing, or null when no store has that printing at least 20% under its market price. */
export function findDeal(
  card: { setCode?: string; toUsd: number },
  price: PriceResponse | "error" | undefined,
  rate: UsdRate | null,
): Deal | null {
  if (!rate || !card.setCode || !price || price === "error" || !price.found || card.toUsd <= 0) return null;
  const listing = price.bySet?.[card.setCode.toUpperCase()];
  if (!listing) return null;
  const marketPhp = card.toUsd * rate.rate;
  // Rounded so exactly 20% off counts (1 - 480/600 is 0.19999… in floating point).
  const savings = Math.round((1 - listing.pricePhp / marketPhp) * 10_000) / 10_000;
  return savings >= DEAL_DISCOUNT ? { listing, marketPhp, savings } : null;
}
