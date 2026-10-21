// Market price trends: cards whose prices are surging.

export type TrendWindow = "day" | "week" | "month";

/** A card's price on one day. */
export interface PricePoint {
  date: string;
  usd: number;
}

export interface TrendCard {
  /** Scryfall printing id, when the app tracked it itself. */
  id?: string;
  name: string;
  /** Scryfall image of the printing whose price moved. */
  imageUrl?: string;
  /** e.g. "MH3". */
  setCode?: string;
  /** US dollars, TCGplayer market price. */
  fromUsd: number;
  toUsd: number;
  /** 0.5 = up 50%; negative for a fall. */
  change: number;
  /** Its price on each day the history covers, oldest first, for a chart. */
  history?: PricePoint[];
}

export interface TrendWindowData {
  /** The date of the earlier price, e.g. "2026-10-11". */
  since: string;
  cards: TrendCard[];
}

export interface MarketTrends {
  /** "mtgjson": the shared daily file built on GitHub; "scryfall": this app's own daily tracking. */
  source: "mtgjson" | "scryfall";
  /** The date of the latest prices, e.g. "2026-10-18". */
  pricesFrom: string;
  windows: Partial<Record<TrendWindow, TrendWindowData>>;
}
