// Deck list logic, kept free of React and storage so it's easy to test.
import { buyAnywhere, buyCheapest, listingsOf, stockOf } from "@/lib/stock";
import type { PriceResponse } from "@/lib/types";

export interface DeckCard {
  name: string;
  qty: number;
}

/** Commander decks are 100 cards; leave room for a maybeboard but cap the price lookups. */
export const MAX_DECK_CARDS = 150;

const key = (name: string) => name.trim().toLowerCase();

// Section headers that deck sites put in exported lists ("Commander", "Creatures (25)", "Sideboard:").
const HEADER =
  /^(commander|commanders|deck|main\s*board|mainboard|side\s*board|sideboard|maybe\s*board|maybeboard|companion|creatures?|instants?|sorcer(?:y|ies)|artifacts?|enchantments?|planeswalkers?|battles?|lands?|other)\s*(\(\d+\))?:?$/i;

/**
 * Reads a pasted deck list, one card per line, in the formats deck sites export:
 * "Sol Ring", "1 Sol Ring", "1x Sol Ring", "1 Sol Ring (CMM) 410 *F*",
 * "1x Sol Ring (cmm) 410 [Ramp] ^Have^". Skips blank lines, "//" comments and
 * section headers, and adds up repeated cards.
 */
export function parseDeckList(text: string): DeckCard[] {
  const cards = new Map<string, DeckCard>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#") || HEADER.test(line)) continue;

    const qtyMatch = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
    const name = (qtyMatch ? qtyMatch[2] : line)
      .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+\S+)?/, "") // set code and collector number
      .replace(/\s+[[^*].*$/, "") // [category], ^tag^ and *F* foil markers
      .trim();
    if (!name || qty < 1) continue;

    const existing = cards.get(key(name));
    if (existing) existing.qty += qty;
    else cards.set(key(name), { name, qty });
  }
  return [...cards.values()];
}

/** Adds a card if it isn't in the deck yet. */
export function addCard(deck: DeckCard[], name: string): DeckCard[] {
  if (deck.some((c) => key(c.name) === key(name)) || deck.length >= MAX_DECK_CARDS) return deck;
  return [...deck, { name, qty: 1 }];
}

export function removeCard(deck: DeckCard[], name: string): DeckCard[] {
  return deck.filter((c) => key(c.name) !== key(name));
}

/** Puts another card in a card's place, with its quantity. */
export function swapCard(deck: DeckCard[], from: string, to: string): DeckCard[] {
  return deck.map((c) => (key(c.name) === key(from) ? { ...c, name: to } : c));
}

export function hasCard(deck: DeckCard[], name: string): boolean {
  return deck.some((c) => key(c.name) === key(name));
}

/** Adds pasted cards; a card already in the deck takes the pasted quantity. */
export function importCards(deck: DeckCard[], cards: DeckCard[]): DeckCard[] {
  const merged = new Map(deck.map((c) => [key(c.name), c]));
  for (const card of cards) {
    if (merged.size >= MAX_DECK_CARDS && !merged.has(key(card.name))) break;
    merged.set(key(card.name), card);
  }
  return [...merged.values()];
}

// --- Pricing ------------------------------------------------------------------

export interface StoreCoverage {
  store: string;
  /** How many of the deck's in-stock cards this store has enough copies of. */
  cards: number;
  /** Cost of those cards at this store, buying its cheapest copies of each. */
  totalPhp: number;
  /** In-stock cards (elsewhere) that this store doesn't have enough copies of. */
  missing: string[];
  /** Of the missing cards, the ones this store has some copies of: name → copies. */
  tooFew: Record<string, number>;
}

export interface DeckPricing {
  /** Each card's cheapest copies anywhere, as many as the deck needs (or as are in stock). */
  cheapestTotalPhp: number;
  /** Cards with at least one listing. */
  inStock: string[];
  /** Cards that were looked up but no store has (or TCGph doesn't list). */
  unavailable: string[];
  /** Cards not looked up yet, or whose lookup failed. */
  unpriced: string[];
  /** Stores with the most of the deck first, then the cheapest. */
  stores: StoreCoverage[];
}

/**
 * Totals for a deck given each card's price lookup (keyed by card name, any
 * case). Several copies of a card are bought cheapest first, which can take
 * more than one listing when a listing hasn't enough stock.
 */
export function priceDeck(deck: DeckCard[], prices: Record<string, PriceResponse | undefined>): DeckPricing {
  const lookup = new Map(Object.entries(prices).map(([name, price]) => [key(name), price]));
  const result: DeckPricing = { cheapestTotalPhp: 0, inStock: [], unavailable: [], unpriced: [], stores: [] };
  const stores = new Map<string, { cards: Set<string>; totalPhp: number; tooFew: Record<string, number> }>();

  for (const card of deck) {
    const price = lookup.get(key(card.name));
    if (!price) {
      result.unpriced.push(card.name);
      continue;
    }
    if (!price.found || !price.cheapest) {
      result.unavailable.push(card.name);
      continue;
    }
    result.inStock.push(card.name);
    result.cheapestTotalPhp += buyAnywhere(price.byStore, card.qty).totalPhp;
    for (const offer of price.byStore) {
      const store = stores.get(offer.store) ?? { cards: new Set<string>(), totalPhp: 0, tooFew: {} };
      const purchase = buyCheapest([listingsOf(offer)], card.qty);
      if (purchase.qty < card.qty) {
        store.tooFew[card.name] = stockOf(offer);
      } else {
        store.cards.add(card.name);
        store.totalPhp += purchase.totalPhp;
      }
      stores.set(offer.store, store);
    }
  }

  result.stores = [...stores.entries()]
    .map(([store, { cards, totalPhp, tooFew }]) => ({
      store,
      cards: cards.size,
      totalPhp,
      missing: result.inStock.filter((name) => !cards.has(name)),
      tooFew,
    }))
    .sort((a, b) => b.cards - a.cards || a.totalPhp - b.totalPhp);
  return result;
}
