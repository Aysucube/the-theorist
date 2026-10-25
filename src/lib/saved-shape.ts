// What The Theorist can keep on your computer as well as in the browser (see
// api/saved): the binder and My Decks. Browser storage belongs to one address,
// port included, so a launcher that opens on another port (or another browser)
// would otherwise start with an empty binder. Pure, so the server and the
// browser share the same rules and they're easy to test.
import type { DeckCard } from "@/lib/deck";

export const SAVED_KEYS = ["binder", "decks"] as const;
export type SavedKey = (typeof SAVED_KEYS)[number];

/** A saved value and when it last changed (ms), so the newer of two copies wins. */
export interface SavedDoc {
  savedAt: number;
  value: unknown;
}

export const isSavedKey = (key: string): key is SavedKey => (SAVED_KEYS as readonly string[]).includes(key);

export function isSavedCard(value: unknown): value is DeckCard {
  const card = value as DeckCard;
  return typeof card?.name === "string" && card.name.trim().length > 0 && Number.isInteger(card.qty) && card.qty > 0;
}

// The same check as My Decks' own (lib/deck-beta/store.ts), so any deck the browser keeps is accepted.
function isDeckLine(value: unknown) {
  const card = value as DeckCard;
  return typeof card?.name === "string" && Number.isInteger(card.qty) && card.qty > 0;
}

function isSavedDeck(value: unknown) {
  const deck = value as { id?: unknown; name?: unknown; cards?: unknown };
  return typeof deck?.id === "string" && typeof deck.name === "string" && Array.isArray(deck.cards) && deck.cards.every(isDeckLine);
}

/** Whether a value has the shape its key holds (and a sane size). */
export function isSavedValue(key: SavedKey, value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return key === "binder" ? value.length <= 100_000 && value.every(isSavedCard) : value.length <= 2_000 && value.every(isSavedDeck);
}

/** The good entries of a stored binder, so one bad line doesn't cost the whole collection. */
export function repairBinder(value: unknown): DeckCard[] | undefined {
  return Array.isArray(value) ? value.filter(isSavedCard) : undefined;
}

/** Two binders, neither known to be newer (saved before copies were dated): every card, at the larger count. */
export function mergeBinders(a: DeckCard[], b: DeckCard[]): DeckCard[] {
  const merged = new Map<string, DeckCard>();
  for (const card of [...a, ...b]) {
    const key = card.name.trim().toLowerCase();
    const prev = merged.get(key);
    merged.set(key, { name: prev?.name ?? card.name, qty: Math.max(prev?.qty ?? 0, card.qty) });
  }
  return [...merged.values()].sort((x, y) => x.name.localeCompare(y.name));
}

/** Two lists of decks: every deck, the first list's copy where both have it, newest first. */
export function mergeDeckLists<T extends { id: string; savedAt: number }>(a: T[], b: T[]): T[] {
  const merged = new Map<string, T>();
  for (const deck of [...b, ...a]) merged.set(deck.id, deck);
  return [...merged.values()].sort((x, y) => y.savedAt - x.savedAt);
}
