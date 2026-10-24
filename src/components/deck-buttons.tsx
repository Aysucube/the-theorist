"use client";

import { hasCard, MAX_DECK_CARDS } from "@/lib/deck";
import { useDeck } from "@/lib/use-deck";

/** "Add to shopping" on a card page; becomes "In shopping ✓" (click to remove). */
export function AddToDeckButton({ name }: { name: string }) {
  const { deck, ready, add, remove } = useDeck();
  const inDeck = hasCard(deck, name);
  const full = !inDeck && deck.length >= MAX_DECK_CARDS;

  return (
    <button
      type="button"
      disabled={!ready || full}
      aria-pressed={inDeck}
      onClick={() => (inDeck ? remove(name) : add(name))}
      className={`h-10 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50 ${
        inDeck
          ? "border border-emerald-600 bg-background text-emerald-700 hover:bg-emerald-50  dark:text-emerald-400 dark:hover:bg-emerald-950"
          : "bg-foreground text-background hover:bg-foreground/85"
      }`}
    >
      {inDeck ? "In shopping ✓" : full ? "Shopping list is full" : "Add to shopping"}
    </button>
  );
}

/** A small +/✓ toggle for recommendation rows. */
export function AddToDeckToggle({ name }: { name: string }) {
  const { deck, ready, add, remove } = useDeck();
  const inDeck = hasCard(deck, name);

  return (
    <button
      type="button"
      disabled={!ready}
      aria-pressed={inDeck}
      aria-label={inDeck ? `Remove ${name} from shopping list` : `Add ${name} to shopping list`}
      title={inDeck ? "In your shopping list (click to remove)" : "Add to shopping list"}
      onClick={() => (inDeck ? remove(name) : add(name))}
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
        inDeck
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-line-strong text-foreground/75 hover:border-foreground/30 hover:text-foreground  "
      }`}
    >
      {inDeck ? "✓" : "+"}
    </button>
  );
}
