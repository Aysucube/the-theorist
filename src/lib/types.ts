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
  /** Just the artwork, cropped out of the card frame. */
  artUrl?: string;
  scryfallUrl: string;
  /** Scryfall's `edhrec_rank`: lower means more popular across all decks. */
  edhrecRank?: number;
  priceUsd?: number;
  commanderLegal: boolean;
  /**
   * Can lead a deck: a legendary card with power/toughness on its front face
   * (creatures, and since 2025 Vehicles and Spacecraft), or text that says so.
   */
  canBeCommander: boolean;
}

/** The basics shown next to a card name in deck lists. */
export interface CardInfo {
  /** Scryfall's full name, e.g. both faces of a double-faced card. */
  name: string;
  typeLine: string;
  manaCost?: string;
  /** W, U, B, R, G; empty for colorless. */
  colorIdentity: string[];
  /** Card image (Scryfall's default printing), for galleries. */
  imageUrl?: string;
}

/** CardInfo plus what the deck beta reads to work out how cards interact. */
export interface CardDetails extends CardInfo {
  /** Scryfall layout, e.g. "normal", "split", "transform". */
  layout: string;
  /** Rules text; both faces for double-faced cards. */
  oracleText: string;
  /** Keyword abilities, e.g. "Flying", "Landfall", "Proliferate". */
  keywords: string[];
  /** Mana value. */
  cmc: number;
  /** Front face's printed power and toughness, if it has a P/T box. */
  power?: string;
  toughness?: string;
  /** Can lead a deck (see lib/commander-rules.ts). Missing on details saved by older versions. */
  canBeCommander?: boolean;
}

/** A combo from Commander Spellbook. */
export interface Combo {
  id: string;
  /** The cards it needs, by name (including the commander when it's a piece). */
  cards: string[];
  /** Pieces any matching card can fill, e.g. "Permanent Castable for {C}". */
  templates: string[];
  /** What it does, e.g. "Infinite colorless mana". */
  results: string[];
  /** How to do it, one step per line. */
  steps: string;
  /** What has to be set up first, if anything. */
  prerequisites: string;
  manaNeeded?: string;
  /** How many decks play it, per Commander Spellbook. */
  popularity?: number;
  url: string;
}

export interface DeckCombos {
  /** Combos the deck (with its commander) already has every piece of. */
  included: Combo[];
  /** Combos one card away, most popular first. */
  almostIncluded: Combo[];
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

/** One official ruling (or Scryfall note) about how a card works. */
export interface Ruling {
  /** "wotc": Wizards of the Coast's official ruling; "scryfall": a note from Scryfall. */
  source: "wotc" | "scryfall";
  /** "2024-11-08" */
  publishedAt: string;
  comment: string;
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
  /** Cards with a similar role, per EDHREC. */
  similar: string[];
}

/** A card often played alongside another, from EDHREC's page for that other card. */
export interface EdhrecPairing {
  name: string;
  /** The EDHREC list it's in, e.g. "Creatures". */
  list: string;
  /** How many times more often it's played with the card than in decks overall; above 1 means they go together. */
  lift: number;
  /** Share of the card's decks that could play it which do (0–1). */
  inclusion?: number;
}

export interface EdhrecCardPairings {
  url: string;
  /** Strongest pairing first. */
  pairings: EdhrecPairing[];
  /** Cards with a similar role. */
  similar: string[];
}

export interface EdhrecCardList {
  header: string;
  cards: EdhrecCardRef[];
}

/** A deck theme (EDHREC calls them tags), e.g. "Tokens" or "Aristocrats". */
export interface EdhrecTheme {
  name: string;
  /** EDHREC's URL slug, e.g. "plus-1-plus-1-counters". */
  slug: string;
  /** Decks on EDHREC with this theme. */
  numDecks: number;
}

export interface EdhrecThemePage {
  name: string;
  url: string;
  numDecks: number;
  /** Commanders that lead the most decks with this theme; numDecks is their decks with the theme. */
  commanders: EdhrecCardRef[];
  /** Cards those decks play, by EDHREC list ("Top Cards", "Creatures", ...). */
  lists: EdhrecCardList[];
}

export interface EdhrecCommanderStats {
  url: string;
  numDecks: number;
  rank?: number;
  lists: EdhrecCardList[];
  /** The playstyles its decks are built around ("Infect", "+1/+1 Counters"...), most decks first. */
  themes?: EdhrecTheme[];
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
  extends Pick<TcgphListing, "pricePhp" | "store" | "condition" | "conditionLabel" | "url" | "quantity"> {
  /** Which printing, e.g. "CMM #410 · Foil", so a store knows which copy is meant. */
  printing?: string;
}

/**
 * A store's offer for a card: its cheapest listing, plus what it takes to buy
 * several copies. `stock` and `listings` are missing from prices saved by older
 * versions of the app; read them through lib/stock.ts, which fills them in.
 */
export interface StoreOffer extends ListingBrief {
  /** Copies in stock across all of this store's listings of the card. */
  stock?: number;
  /** This store's listings of the card, cheapest first, enough to buy up to 99 copies. */
  listings?: ListingBrief[];
}

/** The short version of a card's TCGph prices, for showing next to a card name. */
export interface TcgphSummary {
  url: string;
  /** Cheapest in-stock listing; missing when no store has the card. */
  cheapest?: ListingBrief;
  /** Artwork of the cheapest listing's printing (or of any printing in stock). */
  imageUrl?: string;
  stores: number;
  listings: number;
  /** Each store's cheapest listing for the card, with its stock, cheapest store first. */
  byStore: StoreOffer[];
}

/** What GET /api/preview returns: enough for a hover card. */
export interface CardPreview {
  name: string;
  imageUrl?: string;
  /** Cheapest PH listing; missing when no store has the card. */
  cheapest?: ListingBrief;
  stores: number;
  /** True when TCGph couldn't be reached, so a missing price means "unknown", not "out of stock". */
  priceUnavailable?: boolean;
  /** True when any source failed this time; asking again later may fill the gaps. */
  incomplete?: boolean;
  /** From Scryfall; missing if it couldn't be reached. */
  typeLine?: string;
  manaCost?: string;
  /** W, U, B, R, G; empty for colorless. */
  colorIdentity?: string[];
  oracleText?: string;
  /** From EDHREC: how often Commander decks play it. */
  decks?: {
    numDecks: number;
    inclusion: number;
    /** Commanders that run it most, by name. */
    topCommanders: string[];
  };
  /** Cards with a similar role, per EDHREC. */
  similar?: string[];
}

/** What GET /api/price returns. */
export type PriceResponse = ({ found: true } & TcgphSummary) | { found: false };
