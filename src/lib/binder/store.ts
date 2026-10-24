"use client";

// The Binder's collection, saved in this browser (names and copies only; card
// details live in card-cache.ts). It's separate from Shopping and Deck Synergy.
import { useMemo } from "react";
import type { DeckCard } from "@/lib/deck";
import { createLocalStore, useHydrated } from "@/lib/local-store";
import { mergeCollection, ownedCount, ownedCounts } from "./collection";

function isDeckCard(value: unknown): value is DeckCard {
  const card = value as DeckCard;
  return typeof card?.name === "string" && Number.isInteger(card.qty) && card.qty > 0;
}

const binderStore = createLocalStore<DeckCard[]>(
  "commander-ph:binder",
  [],
  (v): v is DeckCard[] => Array.isArray(v) && v.every(isDeckCard),
);

const key = (name: string) => name.trim().toLowerCase();

/** The collection, how many copies of a card it holds, and edits to it. */
export function useBinder() {
  const cards = binderStore.useValue();
  const ready = useHydrated();
  const counts = useMemo(() => ownedCounts(cards), [cards]);
  return {
    cards,
    ready,
    /** Copies owned (0 when the binder doesn't have it). */
    owned: (name: string) => ownedCount(counts, name),
    add: (list: DeckCard[]) => binderStore.set(mergeCollection(binderStore.get(), list, "add")),
    replace: (list: DeckCard[]) => binderStore.set(mergeCollection([], list, "replace")),
    setQty: (name: string, qty: number) =>
      binderStore.set(
        qty <= 0
          ? binderStore.get().filter((c) => key(c.name) !== key(name))
          : binderStore.get().map((c) => (key(c.name) === key(name) ? { ...c, qty } : c)),
      ),
    clear: () => binderStore.set([]),
  };
}
