// What the deck beta's API routes return.
import type { CardDetails, EdhrecPairing, Ruling } from "@/lib/types";

/** POST /api/deck-beta/cards */
export interface CardsResponse {
  /** Keyed by the names asked for; names Scryfall doesn't know are left out. */
  cards: Record<string, CardDetails>;
}

/** GET /api/deck-beta/pairings */
export type PairingsResponse =
  | { found: false }
  | {
      found: true;
      url: string;
      /** Every card EDHREC says goes with this one (lift above 1), strongest first. */
      pairings: EdhrecPairing[];
      similar: string[];
      /** Details for the strongest pairings and the similar cards, for recommendations. */
      details: Record<string, CardDetails>;
    };

/** GET /api/deck-beta/rulings */
export type RulingsResponse = { found: false } | { found: true; name: string; scryfallUrl: string; rulings: Ruling[] };
