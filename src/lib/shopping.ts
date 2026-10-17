// Turns a priced deck into a shopping list: which stores to visit and what to buy at each.
import type { DeckCard } from "./deck";
import { formatPhp } from "./format";
import type { ListingBrief, PriceResponse } from "./types";

export interface ShoppingItem {
  name: string;
  qty: number;
  offer: ListingBrief;
  lineTotalPhp: number;
}

export interface ShoppingStop {
  store: string;
  /** Cheapest card first. */
  items: ShoppingItem[];
  subtotalPhp: number;
}

export interface ShoppingPlan {
  /** Store with the most cards first. */
  stops: ShoppingStop[];
  totalPhp: number;
  /** Looked up, but no store has them. */
  unavailable: string[];
}

/** Store sets up to this size are searched exhaustively; bigger needs fall back to a greedy pick. */
const EXACT_UP_TO = 3;

interface Wanted {
  name: string;
  qty: number;
  offers: Map<string, ListingBrief>;
}

const key = (name: string) => name.trim().toLowerCase();

function wantedCards(deck: DeckCard[], prices: Record<string, PriceResponse | undefined>) {
  const lookup = new Map(Object.entries(prices).map(([name, price]) => [key(name), price]));
  const wanted: Wanted[] = [];
  const unavailable: string[] = [];
  for (const card of deck) {
    const price = lookup.get(key(card.name));
    if (!price) continue; // not priced yet
    if (!price.found || price.byStore.length === 0) {
      unavailable.push(card.name);
      continue;
    }
    wanted.push({ ...card, offers: new Map(price.byStore.map((o) => [o.store, o])) });
  }
  return { wanted, unavailable };
}

/** Buys each card at the cheapest of the given stores; null if some card isn't at any of them. */
function assign(wanted: Wanted[], stores: string[]) {
  const picks: { card: Wanted; offer: ListingBrief }[] = [];
  let total = 0;
  for (const card of wanted) {
    let best: ListingBrief | undefined;
    for (const store of stores) {
      const offer = card.offers.get(store);
      if (offer && (!best || offer.pricePhp < best.pricePhp)) best = offer;
    }
    if (!best) return null;
    picks.push({ card, offer: best });
    total += best.pricePhp * card.qty;
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
 * Fewest stores that together have every card, cheapest such set first.
 * Exact for up to three stores; beyond that, repeatedly adds the store that
 * covers the most remaining cards (cheaper wins ties).
 */
function fewestStores(wanted: Wanted[]): string[] {
  const stores = [...new Set(wanted.flatMap((c) => [...c.offers.keys()]))];

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
    let pick = { store: "", covered: -1, cost: Infinity };
    for (const store of stores) {
      if (chosen.includes(store)) continue;
      const here = remaining.filter((c) => c.offers.has(store));
      const cost = here.reduce((sum, c) => sum + c.offers.get(store)!.pricePhp * c.qty, 0);
      if (here.length > pick.covered || (here.length === pick.covered && cost < pick.cost)) {
        pick = { store, covered: here.length, cost };
      }
    }
    chosen.push(pick.store);
    remaining = remaining.filter((c) => !c.offers.has(pick.store));
  }
  return chosen;
}

function toPlan(picks: { card: Wanted; offer: ListingBrief }[], unavailable: string[]): ShoppingPlan {
  const stops = new Map<string, ShoppingStop>();
  for (const { card, offer } of picks) {
    const stop = stops.get(offer.store) ?? { store: offer.store, items: [], subtotalPhp: 0 };
    const lineTotalPhp = offer.pricePhp * card.qty;
    stop.items.push({ name: card.name, qty: card.qty, offer, lineTotalPhp });
    stop.subtotalPhp += lineTotalPhp;
    stops.set(offer.store, stop);
  }
  const sorted = [...stops.values()]
    .map((stop) => ({ ...stop, items: stop.items.sort((a, b) => a.offer.pricePhp - b.offer.pricePhp) }))
    .sort((a, b) => b.items.length - a.items.length || b.subtotalPhp - a.subtotalPhp);
  return {
    stops: sorted,
    totalPhp: sorted.reduce((sum, s) => sum + s.subtotalPhp, 0),
    unavailable,
  };
}

/**
 * A one-stop-shop plan: the fewest stores that have every in-stock card, and
 * within those stores each card at its cheapest.
 */
export function planFewestStores(
  deck: DeckCard[],
  prices: Record<string, PriceResponse | undefined>,
): ShoppingPlan {
  const { wanted, unavailable } = wantedCards(deck, prices);
  if (wanted.length === 0) return { stops: [], totalPhp: 0, unavailable };
  return toPlan(assign(wanted, fewestStores(wanted))!.picks, unavailable);
}

/** Each card at its cheapest store, however many stores that takes. For comparison. */
export function planCheapest(
  deck: DeckCard[],
  prices: Record<string, PriceResponse | undefined>,
): ShoppingPlan {
  const { wanted, unavailable } = wantedCards(deck, prices);
  const stores = [...new Set(wanted.flatMap((c) => [...c.offers.keys()]))];
  return toPlan(assign(wanted, stores)?.picks ?? [], unavailable);
}

/** A plain-text order to paste into a message to the store. */
export function orderText(stop: ShoppingStop): string {
  const cards = stop.items.reduce((sum, i) => sum + i.qty, 0);
  const lines = stop.items.map(({ name, qty, offer }) => {
    const details = [offer.printing, offer.condition].filter(Boolean).join(", ");
    return `${qty}x ${name}${details ? ` (${details})` : ""} - ${formatPhp(offer.pricePhp)}${qty > 1 ? " each" : ""}`;
  });
  return [
    `Order for ${stop.store}:`,
    ...lines,
    `Total: ${formatPhp(stop.subtotalPhp)} (${cards} ${cards === 1 ? "card" : "cards"})`,
  ].join("\n");
}
