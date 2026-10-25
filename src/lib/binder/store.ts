"use client";

// The Binder's collection, saved in this browser and, when The Theorist runs on
// your computer, in a file there too, so it survives another port or browser
// (names and copies only; card details live in card-cache.ts). It's separate
// from Shopping and Deck Synergy.
import { useMemo } from "react";
import type { DeckCard } from "@/lib/deck";
import { createLocalStore, useHydrated } from "@/lib/local-store";
import { isSavedCard, mergeBinders, repairBinder } from "@/lib/saved-shape";
import { mergeCollection, ownedCount, ownedCounts } from "./collection";

const binderStore = createLocalStore<DeckCard[]>(
  "commander-ph:binder",
  [],
  // The same rule as the computer's copy, so whatever the browser keeps, the computer accepts.
  (v): v is DeckCard[] => Array.isArray(v) && v.every(isSavedCard),
  { repair: repairBinder, saveTo: "binder", merge: mergeBinders },
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
    /** Where the binder is kept right now: on the computer too, this browser only, or not saved. */
    saveStatus: binderStore.useStatus(),
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
