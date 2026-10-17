"use client";

import Link from "next/link";
import { hasCard, MAX_DECK_CARDS } from "@/lib/deck";
import { useDeck } from "@/lib/use-deck";

/** "Add to deck" on a card page; becomes "In deck ✓" (click to remove). */
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
          ? "border border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
          : "bg-amber-500 text-zinc-950 hover:bg-amber-400"
      }`}
    >
      {inDeck ? "In deck ✓" : full ? "Deck is full" : "Add to deck"}
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
      aria-label={inDeck ? `Remove ${name} from deck` : `Add ${name} to deck`}
      title={inDeck ? "In your deck (click to remove)" : "Add to deck"}
      onClick={() => (inDeck ? remove(name) : add(name))}
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
        inDeck
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-zinc-300 text-zinc-600 hover:border-amber-500 hover:text-amber-700 dark:border-zinc-700 dark:text-zinc-300"
      }`}
    >
      {inDeck ? "✓" : "+"}
    </button>
  );
}

/** Header link to the deck page with the card count. */
export function DeckLink() {
  const { deck, ready } = useDeck();
  const cards = deck.reduce((sum, c) => sum + c.qty, 0);

  return (
    <Link
      href="/deck"
      className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium hover:border-amber-500 dark:border-zinc-700"
    >
      Deck
      {ready && cards > 0 && (
        <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-zinc-950 tabular-nums">
          {cards}
          <span className="sr-only"> cards</span>
        </span>
      )}
    </Link>
  );
}
