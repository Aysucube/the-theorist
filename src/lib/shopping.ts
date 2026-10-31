// Turns a priced deck into a shopping list: which stores to visit and what to buy at each.
import type { DeckCard } from "./deck";
import { formatPhp } from "./format";
import { buyCheapest, copiesOf, enoughFor, listingsOf, stockOf, type Purchase } from "./stock";
import type { ListingBrief, PriceResponse } from "./types";

/** A card this expensive or more gets a menu of cheaper alternatives. */
export const ALTERNATIVES_FROM_PHP = 100;

/** A card's cheapest copy anywhere, when it's been priced and is in stock. */
export function cheapestPhp(price: PriceResponse | "error" | undefined): number | undefined {
  return price && price !== "error" && price.found ? price.cheapest?.pricePhp : undefined;
}

export interface ShoppingItem {
  name: string;
  /** Copies to buy at this store. */
  qty: number;
  /** Listings to buy them from, cheapest first: usually one, more when one listing hasn't enough copies. */
  parts: { offer: ListingBrief; qty: number }[];
  lineTotalPhp: number;
  /** Copies this store has in stock, across all its listings. */
  stock: number;
  /** Other stops buying the rest of this card, when its copies are split between stores. */
  alsoAt: { store: string; qty: number }[];
}

export interface ShoppingStop {
  store: string;
  /** Cheapest card first. */
  items: ShoppingItem[];
  subtotalPhp: number;
}

export interface ShortCard {
  name: string;
  /** Copies the deck needs. */
  qty: number;
  /** Copies in stock across every store; the plan buys all of them. */
  inStock: number;
}

export interface ShoppingPlan {
  /** Store with the most cards first. */
  stops: ShoppingStop[];
  totalPhp: number;
  /** Looked up, but no store has them. */
  unavailable: string[];
  /** In stock, but all the stores together have fewer copies than the deck needs. */
  short: ShortCard[];
}

/** Store sets up to this size are searched exhaustively; bigger needs fall back to a greedy pick. */
const EXACT_UP_TO = 3;

interface Wanted {
  name: string;
  /** Copies to buy: the deck's count, or every copy in stock when the stores together have fewer. */
  qty: number;
  /** Each store's cheapest listings, just enough for `qty` copies; the rest would never be bought. */
  listings: Map<string, ListingBrief[]>;
  /** Copies each store has in stock. */
  stock: Map<string, number>;
}

const key = (name: string) => name.trim().toLowerCase();

function wantedCards(deck: DeckCard[], prices: Record<string, PriceResponse | undefined>) {
  const lookup = new Map(Object.entries(prices).map(([name, price]) => [key(name), price]));
  const wanted: Wanted[] = [];
  const unavailable: string[] = [];
  const short: ShortCard[] = [];
  for (const card of deck) {
    const price = lookup.get(key(card.name));
    if (!price) continue; // not priced yet
    if (!price.found || price.byStore.length === 0) {
      unavailable.push(card.name);
      continue;
    }
    const listings = new Map(price.byStore.map((o) => [o.store, enoughFor(listingsOf(o), card.qty)]));
    const inStock = [...listings.values()].flat().reduce((sum, l) => sum + copiesOf(l), 0);
    if (inStock < card.qty) short.push({ name: card.name, qty: card.qty, inStock });
    wanted.push({
      name: card.name,
      qty: Math.min(card.qty, inStock),
      listings,
      stock: new Map(price.byStore.map((o) => [o.store, stockOf(o)])),
    });
  }
  return { wanted, unavailable, short };
}

const storesOf = (wanted: Wanted[]) => [...new Set(wanted.flatMap((c) => [...c.listings.keys()]))];

/** The cheapest copies of a card at the given stores; fewer than wanted if they don't have enough. */
const buy = (card: Wanted, stores: string[]) =>
  buyCheapest(
    stores.map((store) => card.listings.get(store) ?? []),
    card.qty,
  );

/** Buys every card as cheaply as the given stores allow; null if they lack enough copies of some card. */
function assign(wanted: Wanted[], stores: string[]) {
  const picks: { card: Wanted; purchase: Purchase }[] = [];
  let total = 0;
  for (const card of wanted) {
    const purchase = buy(card, stores);
    if (purchase.qty < card.qty) return null;
    picks.push({ card, purchase });
    total += purchase.totalPhp;
  }
  return { picks, total };
}

function* combinations<T>(items: T[], size: number, start = 0): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - size; i++) {
    for (const rest of combinations(items, size - 1, i + 1)) yield [items[i], ...rest];
  }
}

/**
 * Fewest stores that together have enough copies of every card, cheapest such
 * set first. Exact for up to three stores; beyond that, repeatedly adds the
 * store that completes the most remaining cards. Ties go to the store that
 * adds the most copies toward the rest (so a card no one store has enough of
 * still gets filled in), then to the cheaper one.
 */
function fewestStores(wanted: Wanted[]): string[] {
  const stores = storesOf(wanted);

  for (let size = 1; size <= Math.min(EXACT_UP_TO, stores.length); size++) {
    let best: { stores: string[]; total: number } | null = null;
    for (const combo of combinations(stores, size)) {
      const result = assign(wanted, combo);
      if (result && (!best || result.total < best.total)) best = { stores: combo, total: result.total };
    }
    if (best) return best.stores;
  }

  const chosen: string[] = [];
  let remaining = wanted;
  while (remaining.length > 0) {
    let pick = { store: "", covered: -1, copies: -1, cost: Infinity };
    for (const store of stores) {
      if (chosen.includes(store)) continue;
      const trial = [...chosen, store];
      let covered = 0;
      let copies = 0;
      let cost = 0;
      for (const card of remaining) {
        const purchase = buy(card, trial);
        copies += purchase.qty;
        if (purchase.qty === card.qty) {
          covered++;
          cost += purchase.totalPhp;
        }
      }
      if (
        covered > pick.covered ||
        (covered === pick.covered && (copies > pick.copies || (copies === pick.copies && cost < pick.cost)))
      ) {
        pick = { store, covered, copies, cost };
      }
    }
    // Every quantity is capped at the copies in stock, so some store always adds
    // copies until all cards are covered; this only guards against a bug looping forever.
    if (!pick.store) break;
    chosen.push(pick.store);
    remaining = remaining.filter((c) => buy(c, chosen).qty < c.qty);
  }
  return chosen;
}

/** Same printing, condition and price: one line in the order, even if the store lists it twice. */
const sameCopy = (a: ListingBrief, b: ListingBrief) =>
  a.printing === b.printing && a.condition === b.condition && a.pricePhp === b.pricePhp;

function toPlan(picks: { card: Wanted; purchase: Purchase }[], unavailable: string[], short: ShortCard[]): ShoppingPlan {
  const stops = new Map<string, ShoppingStop>();
  for (const { card, purchase } of picks) {
    // A card's copies may come from several stores: one item per store.
    const items = new Map<string, ShoppingItem>();
    for (const { offer, qty } of purchase.parts) {
      const item = items.get(offer.store) ?? {
        name: card.name,
        qty: 0,
        parts: [],
        lineTotalPhp: 0,
        stock: card.stock.get(offer.store) ?? qty,
        alsoAt: [],
      };
      const same = item.parts.find((p) => sameCopy(p.offer, offer));
      if (same) same.qty += qty;
      else item.parts.push({ offer, qty });
      item.qty += qty;
      item.lineTotalPhp += offer.pricePhp * qty;
      items.set(offer.store, item);
    }
    for (const [store, item] of items) {
      item.alsoAt = [...items].filter(([other]) => other !== store).map(([other, { qty }]) => ({ store: other, qty }));
      const stop = stops.get(store) ?? { store, items: [], subtotalPhp: 0 };
      stop.items.push(item);
      stop.subtotalPhp += item.lineTotalPhp;
      stops.set(store, stop);
    }
  }
  const sorted = [...stops.values()]
    .map((stop) => ({
      ...stop,
      items: stop.items.sort((a, b) => a.parts[0].offer.pricePhp - b.parts[0].offer.pricePhp),
    }))
    .sort((a, b) => b.items.length - a.items.length || b.subtotalPhp - a.subtotalPhp);
  return {
    stops: sorted,
    totalPhp: sorted.reduce((sum, s) => sum + s.subtotalPhp, 0),
    unavailable,
    short,
  };
}

/**
 * A one-stop-shop plan: the fewest stores that have enough copies of every
 * in-stock card, and within those stores the cheapest copies, splitting a
 * card between them when no one of them has enough (or splitting is cheaper).
 */
export function planFewestStores(
  deck: DeckCard[],
  prices: Record<string, PriceResponse | undefined>,
): ShoppingPlan {
  const { wanted, unavailable, short } = wantedCards(deck, prices);
  if (wanted.length === 0) return { stops: [], totalPhp: 0, unavailable, short };
  return toPlan(assign(wanted, fewestStores(wanted))!.picks, unavailable, short);
}

/** Each card's cheapest copies, however many stores that takes. For comparison. */
export function planCheapest(
  deck: DeckCard[],
  prices: Record<string, PriceResponse | undefined>,
): ShoppingPlan {
  const { wanted, unavailable, short } = wantedCards(deck, prices);
  return toPlan(assign(wanted, storesOf(wanted))?.picks ?? [], unavailable, short);
}

/**
 * What a shopping-list tick remembers. Usually the card, so a tick survives the
 * plan moving it to another store; a card split between stores gets one per store.
 */
export function tickKey(item: ShoppingItem, store: string): string {
  return item.alsoAt.length > 0 ? `${item.name} @ ${store}` : item.name;
}

/** A plain-text order to paste into a message to the store. */
export function orderText(stop: ShoppingStop): string {
  const cards = stop.items.reduce((sum, i) => sum + i.qty, 0);
  const lines = stop.items.flatMap(({ name, parts }) =>
    parts.map(({ offer, qty }) => {
      const details = [offer.printing, offer.condition].filter(Boolean).join(", ");
      return `${qty}x ${name}${details ? ` (${details})` : ""} - ${formatPhp(offer.pricePhp)}${qty > 1 ? " each" : ""}`;
    }),
  );
  return [
    `Order for ${stop.store}:`,
    ...lines,
    `Total: ${formatPhp(stop.subtotalPhp)} (${cards} ${cards === 1 ? "card" : "cards"})`,
  ].join("\n");
}
