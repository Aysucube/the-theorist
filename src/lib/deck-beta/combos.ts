// Deck Synergy: the deck's commander, its combos, and how reliably it puts
// them together. "Consistency" here is the chance of holding every piece of a
// combo by a given turn, from the deck list alone (no mulligans, no extra
// card draw, each tutor in hand finding one missing piece).
import { canBeCommander } from "@/lib/commander-rules";
import type { CardDetails, Combo, DeckCombos, EdhrecCombo } from "@/lib/types";
import { cardKey } from "./recommend";

/** Cards that could lead this deck, best fit first: covers the deck's colors, then most colors. */
export function commanderOptions(cards: CardDetails[], deckColors: string[]): CardDetails[] {
  const eligible = cards.filter(
    (c) =>
      c.canBeCommander ??
      canBeCommander({ typeLine: c.typeLine.split(" // ")[0], power: c.power, toughness: c.toughness, oracleText: c.oracleText }),
  );
  const covers = (c: CardDetails) => deckColors.every((color) => c.colorIdentity.includes(color));
  return eligible.sort(
    (a, b) =>
      Number(covers(b)) - Number(covers(a)) ||
      b.colorIdentity.length - a.colorIdentity.length ||
      a.name.localeCompare(b.name),
  );
}

// --- Tutors --------------------------------------------------------------------

const TYPE_WORDS = new Set(["creature", "artifact", "enchantment", "instant", "sorcery", "land", "planeswalker", "battle", "equipment", "aura"]);
const TUTOR = /search your library for (?:a|an|one|up to one|up to two|two)\s+((?:[\w-]+,?\s+){0,4}?)cards?\b(?!\s+named)/i;

/**
 * What a tutor can find, as type words a piece's type line must contain (any
 * one of them), or [] for any card. Null when the card isn't a tutor for combo
 * pieces (e.g. it only fetches basic lands).
 */
export function tutorTarget(card: CardDetails): string[] | null {
  const match = card.oracleText.match(TUTOR);
  if (!match) return null;
  const words = match[1].toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (words.includes("basic")) return null;
  const types = words.filter((w) => TYPE_WORDS.has(w));
  // Only lands: ramp, not a combo tutor.
  if (types.length === 1 && types[0] === "land") return null;
  return types;
}

/** True when a tutor that finds `target` can fetch this card. */
export function tutorFinds(target: string[], piece: CardDetails | undefined): boolean {
  if (target.length === 0) return true;
  const typeLine = piece?.typeLine.toLowerCase() ?? "";
  return target.some((t) => typeLine.includes(t));
}

// --- Odds ----------------------------------------------------------------------

/** Cards you've seen by your turn N on the play: a 7-card hand plus a draw each turn after the first. */
export const cardsSeenByTurn = (turn: number) => 7 + Math.max(0, turn - 1);

/**
 * The chance that `pieces` specific cards (one copy each) are all among the
 * top `seen` cards of a shuffled library of `librarySize` (hypergeometric).
 */
export function chanceAllSeen(pieces: number, librarySize: number, seen: number): number {
  if (pieces === 0) return 1;
  if (pieces > seen || librarySize <= 0) return 0;
  let chance = 1;
  for (let i = 0; i < pieces; i++) chance *= (Math.min(seen, librarySize) - i) / (librarySize - i);
  return chance;
}

/** A small seeded random generator (mulberry32), so results are the same every time. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ConsistencyInput {
  /** The library: every card but the commander, one entry per copy. */
  library: string[];
  /** Each combo's pieces that are in the library (the commander is always available). */
  combos: string[][];
  /** Tutors in the library and what each finds (see tutorTarget). */
  tutors: Map<string, string[]>;
  /** Details by card name, for matching tutors to pieces. */
  details: Map<string, CardDetails>;
  turns: number[];
  runs?: number;
  seed?: number;
}

/**
 * The chance of having every piece of at least one combo by each turn, with
 * tutors in hand each finding one missing piece. Shuffles the library many
 * times and counts.
 */
export function simulateConsistency({ library, combos, tutors, details, turns, runs = 4000, seed = 1 }: ConsistencyInput) {
  const sorted = [...turns].sort((a, b) => a - b);
  const hits = new Map(sorted.map((t) => [t, 0]));
  if (combos.length === 0 || library.length === 0) return Object.fromEntries(sorted.map((t) => [t, 0]));

  const rand = random(seed);
  const deck = [...library];
  for (let run = 0; run < runs; run++) {
    // Fisher-Yates shuffle.
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    for (const turn of sorted) {
      const seen = new Set(deck.slice(0, cardsSeenByTurn(turn)));
      if (combos.some((pieces) => assembled(pieces, seen, tutors, details))) {
        // Seen cards only grow, so every later turn counts too.
        for (const later of sorted.filter((t) => t >= turn)) hits.set(later, hits.get(later)! + 1);
        break;
      }
    }
  }
  return Object.fromEntries(sorted.map((t) => [t, hits.get(t)! / runs]));
}

function assembled(pieces: string[], seen: Set<string>, tutors: Map<string, string[]>, details: Map<string, CardDetails>) {
  const missing = pieces.filter((p) => !seen.has(p));
  if (missing.length === 0) return true;
  const inHand = [...tutors].filter(([name]) => seen.has(name) && !pieces.includes(name));
  if (inHand.length < missing.length) return false;
  const used = new Set<string>();
  // Greedy: the pickiest missing piece takes the first tutor that can find it.
  for (const piece of missing) {
    const tutor = inHand.find(([name, target]) => !used.has(name) && tutorFinds(target, details.get(piece)));
    if (!tutor) return false;
    used.add(tutor[0]);
  }
  return true;
}

// --- Combos in a deck ------------------------------------------------------------

/** The deck's own spelling of each card in a combo (null for a card the deck lacks), keyed by front face. */
export function piecesInDeck(combo: Combo, deckNames: string[]): (string | null)[] {
  const byKey = new Map(deckNames.map((n) => [cardKey(n), n]));
  return combo.cards.map((name) => byKey.get(cardKey(name)) ?? null);
}

/** The card a one-card-away combo is missing, or undefined. */
export function missingPiece(combo: Combo, deckNames: string[]): string | undefined {
  const pieces = piecesInDeck(combo, deckNames);
  const i = pieces.indexOf(null);
  return i >= 0 ? combo.cards[i] : undefined;
}

/** Every card a combo needs that the deck lacks. */
export function missingPieces(combo: Combo, deckNames: string[]): string[] {
  const pieces = piecesInDeck(combo, deckNames);
  return combo.cards.filter((_, i) => !pieces[i]);
}

/** How many one-card-away and wider combos to keep. */
const MAX_WIDER = 20;

/**
 * Adds EDHREC's combos for the commander to Commander Spellbook's: combos
 * Spellbook already found get EDHREC's order and deck count; the rest are
 * sorted by how many cards the deck lacks (none, one, or more: "wider"),
 * using Spellbook's own copy of each (with its steps) where there is one.
 * One-card-away combos EDHREC lists come first, in EDHREC's order.
 */
export function mergeEdhrecCombos(
  spellbook: DeckCombos | null,
  edhrec: EdhrecCombo[],
  deckNames: string[],
  details: Record<string, Combo>,
): DeckCombos {
  const listed = new Map(edhrec.map((c, i) => [c.id, { combo: c, order: i }]));
  const withEdhrec = (combo: Combo): Combo => {
    const hit = listed.get(combo.id);
    return hit ? { ...combo, edhrecOrder: hit.order, edhrecDecks: hit.combo.decks, edhrecUrl: hit.combo.url } : combo;
  };
  const included = (spellbook?.included ?? []).map(withEdhrec);
  const almost = (spellbook?.almostIncluded ?? []).map(withEdhrec);
  const wider: Combo[] = [];
  const known = new Set([...included, ...almost].map((c) => c.id));

  edhrec.forEach((e, order) => {
    if (known.has(e.id)) return;
    const base: Combo = details[e.id] ?? {
      id: e.id,
      cards: e.cards,
      templates: [],
      results: e.results,
      steps: "",
      prerequisites: "",
      url: `https://commanderspellbook.com/combo/${encodeURIComponent(e.id)}/`,
    };
    const combo: Combo = { ...base, edhrecOrder: order, edhrecDecks: e.decks, edhrecUrl: e.url };
    const lacking = missingPieces(combo, deckNames).length;
    if (lacking === 0) included.push(combo);
    else if (lacking === 1) almost.push(combo);
    else wider.push(combo);
  });

  // (Infinity - Infinity is NaN, which falls through to popularity.)
  const listedFirst = (a: Combo, b: Combo) =>
    (a.edhrecOrder ?? Infinity) - (b.edhrecOrder ?? Infinity) || (b.popularity ?? 0) - (a.popularity ?? 0);
  return {
    included,
    almostIncluded: almost.sort(listedFirst),
    wider: wider.slice(0, MAX_WIDER),
  };
}

/** Combos that use a given card. */
export function combosWith(combos: Combo[], name: string): Combo[] {
  const key = cardKey(name);
  return combos.filter((c) => c.cards.some((n) => cardKey(n) === key));
}
