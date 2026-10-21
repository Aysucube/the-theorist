// Deck Synergy: what a deck is built around (its playstyle "hubs"), read from
// how its cards interact, and which cards don't connect to anything.
import { interactionsOf, partnersOf, tagKind, type DeckAnalysis, type Tag } from "./synergy";

export interface Hub {
  tag: Tag;
  /** Cards that reward this tag. */
  payoffs: string[];
  /** Cards that are or make it. */
  enablers: string[];
  /** Everyone involved, alphabetical. */
  cards: string[];
}

/** Tags too common to say anything about a deck (almost every deck has lands and creatures). */
const TOO_BROAD = new Set<Tag>(["type:Land", "theme:spells"]);

/**
 * The deck's playstyle: tags that some cards reward and several cards feed,
 * biggest first, specific ones (Elves, Tokens) ahead of plain card types.
 */
export function deckHubs(analysis: DeckAnalysis, limit = 6): Hub[] {
  const payoffs = new Map<Tag, string[]>();
  const enablers = new Map<Tag, string[]>();
  for (const [name, traits] of analysis.traits) {
    for (const tag of traits.cares) payoffs.set(tag, [...(payoffs.get(tag) ?? []), name]);
    for (const tag of traits.is) enablers.set(tag, [...(enablers.get(tag) ?? []), name]);
  }

  const hubs: (Hub & { score: number })[] = [];
  for (const [tag, rewards] of payoffs) {
    const feeds = enablers.get(tag) ?? [];
    if (TOO_BROAD.has(tag) || feeds.length < 2) continue;
    const cards = [...new Set([...rewards, ...feeds])].sort();
    // Payoffs make a playstyle; broad card types count for less.
    const score = (cards.length + rewards.length * 2) * (tagKind(tag) === "type" ? 0.5 : 1);
    hubs.push({ tag, payoffs: rewards.sort(), enablers: feeds.sort(), cards, score });
  }
  return hubs
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map(({ tag, payoffs: p, enablers: e, cards }) => ({ tag, payoffs: p, enablers: e, cards }));
}

/** Deck cards that interact with nothing else in the deck: the first places to look for cuts. */
export function looseCards(analysis: DeckAnalysis, skip: (name: string) => boolean = () => false): string[] {
  return [...analysis.traits]
    .filter(([name, traits]) => !skip(name) && partnersOf(interactionsOf(traits, analysis.traits, name)).size === 0)
    .map(([name]) => name)
    .sort();
}
