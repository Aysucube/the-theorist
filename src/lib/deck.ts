// Deck list logic, kept free of React and storage so it's easy to test.
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
  /** How many of the deck's in-stock cards this store has. */
  cards: number;
  /** Cost of those cards at this store, using its cheapest listing for each. */
  totalPhp: number;
  /** In-stock cards (elsewhere) that this store doesn't have. */
  missing: string[];
}

export interface DeckPricing {
  /** Each card at its cheapest listing anywhere, times its quantity. */
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
 * case). Totals assume a store has enough copies; TCGph only gives per-listing stock.
 */
export function priceDeck(deck: DeckCard[], prices: Record<string, PriceResponse | undefined>): DeckPricing {
  const lookup = new Map(Object.entries(prices).map(([name, price]) => [key(name), price]));
  const result: DeckPricing = { cheapestTotalPhp: 0, inStock: [], unavailable: [], unpriced: [], stores: [] };
  const stores = new Map<string, { cards: Set<string>; totalPhp: number }>();

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
    result.cheapestTotalPhp += price.cheapest.pricePhp * card.qty;
    for (const offer of price.byStore) {
      const store = stores.get(offer.store) ?? { cards: new Set<string>(), totalPhp: 0 };
      store.cards.add(card.name);
      store.totalPhp += offer.pricePhp * card.qty;
      stores.set(offer.store, store);
    }
  }

  result.stores = [...stores.entries()]
    .map(([store, { cards, totalPhp }]) => ({
      store,
      cards: cards.size,
      totalPhp,
      missing: result.inStock.filter((name) => !cards.has(name)),
    }))
    .sort((a, b) => b.cards - a.cards || a.totalPhp - b.totalPhp);
  return result;
}
