// What the deck beta's API routes return.
import type { EdhrecArticle } from "@/lib/sources/edhrec-articles";
import type { CardDetails, DeckCombos, EdhrecDeckAverages, EdhrecPairing, EdhrecTheme, Ruling, SpellbookBracket } from "@/lib/types";

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

/** POST /api/deck-beta/analysis */
export interface AnalysisResponse {
  /** Null when Commander Spellbook couldn't be reached. */
  combos: DeckCombos | null;
  /** Commander Spellbook's bracket estimate; null when it couldn't be reached. */
  bracket: SpellbookBracket | null;
  /** The commander's playstyles on EDHREC, most decks first. */
  themes: EdhrecTheme[];
  commanderUrl?: string;
  /** Details for the cards one-card-away combos are missing, to show and add them. */
  missing: Record<string, CardDetails>;
}

export interface PlaystyleCard {
  name: string;
  /** EDHREC synergy for this commander and playstyle (-1 to 1). */
  synergy?: number;
  /** Share of these decks that run it (0–1). */
  inclusion?: number;
  numDecks: number;
}

/** GET /api/deck-beta/land-art */
export type LandArtResponse =
  | { found: false }
  | {
      found: true;
      /** The land, e.g. "Savannah". */
      name: string;
      artUrl: string;
      artist?: string;
      set?: string;
    };

/** GET /api/deck-beta/playstyle */
export type PlaystyleResponse =
  | { found: false }
  | {
      found: true;
      url: string;
      /** The playstyle's best cards for this commander, highest synergy first. */
      cards: PlaystyleCard[];
      /** Every card EDHREC lists for it, to spot deck cards that don't fit. */
      listed: string[];
      details: Record<string, CardDetails>;
    };

/** One card EDHREC's decks for a commander play, for Create Commander Deck. */
export interface BuilderCard {
  name: string;
  synergy?: number;
  inclusion?: number;
  numDecks: number;
  /** The EDHREC lists it's in, e.g. "New Cards", "High Synergy Cards", "Lands". */
  lists: string[];
}

/** GET /api/deck-beta/builder */
export type BuilderResponse =
  | { found: false }
  | {
      found: true;
      url: string;
      numDecks: number;
      themes: EdhrecTheme[];
      averages?: EdhrecDeckAverages;
      bracketCounts?: Record<string, number>;
      /** The average mana value of its decks' spells. */
      curveAverage?: number;
      /** EDHREC articles about the commander, for how it's played. */
      articles?: EdhrecArticle[];
      cards: BuilderCard[];
      details: Record<string, CardDetails>;
    };

/** GET /api/deck-beta/lands: the lands that fix a deck's colors, most played first. */
export interface LandsResponse {
  lands: CardDetails[];
}

/** GET /api/deck-beta/commander-plan: how a commander is built and played, for its game plan. */
export type CommanderPlanResponse =
  | { found: false }
  | {
      found: true;
      url: string;
      numDecks: number;
      themes: EdhrecTheme[];
      averages?: EdhrecDeckAverages;
      curveAverage?: number;
      articles: EdhrecArticle[];
    };
