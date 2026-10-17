// Shared domain types. Each source module maps its raw response into these.

// --- Scryfall ---------------------------------------------------------------

export interface ScryfallCard {
  id: string;
  /** Shared by every printing of the card; used to list its printings. */
  oracleId?: string;
  name: string;
  /** Scryfall layout, e.g. "normal", "split", "transform", "adventure". */
  layout: string;
  typeLine: string;
  manaCost?: string;
  oracleText?: string;
  colorIdentity: string[];
  imageUrl?: string;
  scryfallUrl: string;
  /** Scryfall's `edhrec_rank`: lower means more popular across all decks. */
  edhrecRank?: number;
  priceUsd?: number;
  commanderLegal: boolean;
  /** Legendary creature, or text says it can be your commander. */
  canBeCommander: boolean;
}

/** One paper printing of a card, from Scryfall. */
export interface Printing {
  /** Upper-case, as TCGph shows it, e.g. "CMM". */
  setCode: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string;
  rarity: string;
  /** "nonfoil", "foil", "etched". */
  finishes: string[];
  imageUrl?: string;
  scryfallUrl: string;
}

export interface ScryfallLookup {
  card: ScryfallCard;
  /** Other matching names when the search was ambiguous. */
  alternatives: string[];
}

// --- EDHREC -----------------------------------------------------------------

export interface EdhrecCardRef {
  name: string;
  numDecks: number;
  potentialDecks?: number;
  /** numDecks / potentialDecks, 0–1. */
  inclusion?: number;
  /** How much more often the card shows up with this commander than in general (-1 to 1). */
  synergy?: number;
}

export interface EdhrecCardStats {
  url: string;
  numDecks: number;
  potentialDecks: number;
  inclusion: number;
  salt?: number;
  /** Commanders whose decks run this card most. */
  topCommanders: EdhrecCardRef[];
}

export interface EdhrecCardList {
  header: string;
  cards: EdhrecCardRef[];
}

export interface EdhrecCommanderStats {
  url: string;
  numDecks: number;
  rank?: number;
  lists: EdhrecCardList[];
}

// --- TCGph ------------------------------------------------------------------

export interface TcgphListing {
  listingId: string;
  store: string;
  /** Short code as shown on TCGph, e.g. "NM", "LP", "U". */
  condition: string;
  /** Full label, e.g. "Near Mint". */
  conditionLabel?: string;
  quantity?: number;
  pricePhp: number;
  url: string;
}

export interface TcgphPrint {
  printId: string;
  setName: string;
  setCode?: string;
  collectorNumber?: string;
  finish?: string;
  language?: string;
  url: string;
  /** The printing's card image, as TCGph shows it. */
  imageUrl?: string;
  listings: TcgphListing[];
}

/** One listing paired with the printing it belongs to. */
export interface TcgphPrice {
  print: TcgphPrint;
  listing: TcgphListing;
}

export interface TcgphPrices {
  url: string;
  prints: TcgphPrint[];
}

/** One store listing, trimmed to what the price button and shopping list show. */
export interface ListingBrief
  extends Pick<TcgphListing, "pricePhp" | "store" | "condition" | "conditionLabel" | "url"> {
  /** Which printing, e.g. "CMM #410 · Foil", so a store knows which copy is meant. */
  printing?: string;
}

/** The short version of a card's TCGph prices, for showing next to a card name. */
export interface TcgphSummary {
  url: string;
  /** Cheapest in-stock listing; missing when no store has the card. */
  cheapest?: ListingBrief;
  stores: number;
  listings: number;
  /** Each store's cheapest listing for the card, cheapest store first. */
  byStore: ListingBrief[];
}

/** What GET /api/price returns. */
export type PriceResponse = ({ found: true } & TcgphSummary) | { found: false };
