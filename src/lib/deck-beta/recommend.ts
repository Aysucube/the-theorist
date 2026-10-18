// Deck beta: "other" recommendations for one card, from EDHREC's list of cards
// played with it and its similar cards, minus what the deck already has.
// Cards in the deck's colors come first, then ones that work with the card.
import type { CardDetails, EdhrecPairing } from "@/lib/types";
import {
  deckCardTraits,
  fitsColors,
  interactionsOf,
  linkTags,
  partnersOf,
  subtypeVocabulary,
  type DeckAnalysis,
  type Tag,
} from "./synergy";

/** Front face, lower-cased: EDHREC names double-faced cards by their front. */
export const cardKey = (name: string) => name.split(" // ")[0].trim().toLowerCase();

/**
 * How strongly EDHREC ties a card to another: lift (how much more often they're
 * played together) weighted by inclusion (how often they actually are). Lift
 * alone favors oddities seen in a handful of decks; inclusion alone favors
 * staples like Sol Ring that go in everything.
 */
export function pairingStrength(pairing: Pick<EdhrecPairing, "lift" | "inclusion">): number {
  return (pairing.inclusion ?? 0) * Math.log(Math.max(pairing.lift, 1));
}

export const byStrength = (a: EdhrecPairing, b: EdhrecPairing) => pairingStrength(b) - pairingStrength(a);

export interface Recommendation {
  card: CardDetails;
  /** Fits the deck's color identity. */
  inColors: boolean;
  /** How it works with the card the map is about, most specific first. */
  withFocus: Tag[];
  /** How many of the deck's cards it works with. */
  deckPartners: number;
  /** EDHREC's numbers for it alongside the focus card, if it's on that card's page. */
  pairing?: EdhrecPairing;
  /** EDHREC lists it as doing a similar job to the focus card. */
  similar: boolean;
}

export interface RecommendInput {
  focus: CardDetails;
  deck: DeckAnalysis;
  /** Names already in the deck (any spelling). */
  deckNames: string[];
  pairings: EdhrecPairing[];
  similar: string[];
  details: Record<string, CardDetails>;
}

export function recommend({ focus, deck, deckNames, pairings, similar, details }: RecommendInput): Recommendation[] {
  const inDeck = new Set([...deckNames, focus.name].map(cardKey));
  const pairingOf = new Map(pairings.map((p) => [cardKey(p.name), p]));
  const similarKeys = new Set(similar.map(cardKey));

  const candidates = new Map<string, CardDetails>();
  for (const card of Object.values(details)) {
    const key = cardKey(card.name);
    if (!inDeck.has(key) && !candidates.has(key)) candidates.set(key, card);
  }

  const vocabulary = [...new Set([...deck.vocabulary, ...subtypeVocabulary([...candidates.values()])])];
  const focusTraits = deckCardTraits(focus, vocabulary, deck.mainCreatureType);

  const recommendations = [...candidates].map(([key, card]): Recommendation => {
    const traits = deckCardTraits(card, vocabulary, deck.mainCreatureType);
    return {
      card,
      inColors: fitsColors(card, deck.colors),
      withFocus: linkTags(traits, focusTraits),
      deckPartners: partnersOf(interactionsOf(traits, deck.traits)).size,
      pairing: pairingOf.get(key),
      similar: similarKeys.has(key),
    };
  });

  const strength = (r: Recommendation) => (r.pairing ? pairingStrength(r.pairing) : 0);
  return recommendations.sort(
    (a, b) =>
      Number(b.inColors) - Number(a.inColors) ||
      Number(b.withFocus.length > 0 || b.similar) - Number(a.withFocus.length > 0 || a.similar) ||
      strength(b) - strength(a) ||
      b.deckPartners - a.deckPartners ||
      a.card.name.localeCompare(b.card.name),
  );
}

/** The deck's cards that EDHREC says are often played with the focus card, strongest first. */
export function pairingsInDeck(pairings: EdhrecPairing[], deckNames: string[]): EdhrecPairing[] {
  const inDeck = new Map(deckNames.map((n) => [cardKey(n), n]));
  return pairings
    .filter((p) => inDeck.has(cardKey(p.name)))
    .map((p) => ({ ...p, name: inDeck.get(cardKey(p.name))! }))
    .sort(byStrength);
}
