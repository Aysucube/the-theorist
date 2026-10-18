// How many copies of a card a store can sell, and what buying several costs.
// TCGph shows stock per listing, so ten Islands may take two listings at one
// store (5 at ₱30, then 5 at ₱35), or listings at two stores.
import type { ListingBrief, StoreOffer } from "./types";

/** Copies in one listing. TCGph only shows listings that are in stock, so an unreadable count still means one. */
export const copiesOf = (listing: ListingBrief) => listing.quantity ?? 1;

/** A store's listings of a card, cheapest first. Prices saved by older versions kept only the cheapest. */
export const listingsOf = (offer: StoreOffer): ListingBrief[] => offer.listings ?? [offer];

/** Copies a store has of a card, across all of its listings. */
export const stockOf = (offer: StoreOffer) =>
  offer.stock ?? listingsOf(offer).reduce((sum, l) => sum + copiesOf(l), 0);

/** The cheapest listings (cheapest first) that together hold `qty` copies; all of them if they hold fewer. */
export function enoughFor(listings: ListingBrief[], qty: number): ListingBrief[] {
  let copies = 0;
  const needed = listings.findIndex((l) => (copies += copiesOf(l)) >= qty);
  return needed === -1 ? listings : listings.slice(0, needed + 1);
}

export interface Purchase {
  /** Listings to buy from, cheapest first, and how many copies from each. */
  parts: { offer: ListingBrief; qty: number }[];
  /** Copies bought: fewer than asked for when the listings run out. */
  qty: number;
  totalPhp: number;
}

/**
 * The cheapest `qty` copies among several stores' listings (each store's
 * cheapest first), or every copy if there are fewer. Within one store this
 * fills up from its next-cheapest listing; across stores it takes whichever
 * is cheaper. At equal prices the store with more copies wins, so a card
 * isn't split between stores for nothing.
 */
export function buyCheapest(stores: ListingBrief[][], qty: number): Purchase {
  const copies = stores.map((listings) => listings.reduce((sum, l) => sum + copiesOf(l), 0));
  const next = stores.map(() => 0);
  const purchase: Purchase = { parts: [], qty: 0, totalPhp: 0 };

  while (purchase.qty < qty) {
    let from = -1;
    for (let s = 0; s < stores.length; s++) {
      const listing = stores[s][next[s]];
      if (!listing) continue;
      const best = from === -1 ? undefined : stores[from][next[from]];
      if (!best || listing.pricePhp < best.pricePhp || (listing.pricePhp === best.pricePhp && copies[s] > copies[from])) {
        from = s;
      }
    }
    if (from === -1) break; // out of copies

    const offer = stores[from][next[from]++];
    const take = Math.min(copiesOf(offer), qty - purchase.qty);
    purchase.parts.push({ offer, qty: take });
    purchase.qty += take;
    purchase.totalPhp += offer.pricePhp * take;
  }
  return purchase;
}

/** The cheapest `qty` copies of a card anywhere, from its price lookup's stores. */
export const buyAnywhere = (byStore: StoreOffer[], qty: number) => buyCheapest(byStore.map(listingsOf), qty);
