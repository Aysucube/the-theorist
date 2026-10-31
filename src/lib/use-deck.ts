"use client";

import { addCard, importCards, removeCard, swapCard, type DeckCard } from "@/lib/deck";
import { createLocalStore, useHydrated } from "@/lib/local-store";
import { useEffect } from "react";
import type { Lookup } from "@/lib/price-lookup";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { CardInfo } from "@/lib/types";

// Everything here lives in this browser's localStorage: no account needed, but
// it doesn't follow the user to another device or browser.

function isDeckCard(value: unknown): value is DeckCard {
  const card = value as DeckCard;
  return typeof card?.name === "string" && Number.isInteger(card.qty) && card.qty > 0;
}

const deckStore = createLocalStore<DeckCard[]>(
  "commander-ph:deck",
  [],
  (v): v is DeckCard[] => Array.isArray(v) && v.every(isDeckCard),
);

/** A card's last price check, or "error" when the check failed. */
export type { Lookup };

export interface SavedPrices {
  /** When the last pricing run finished (ms since epoch); 0 if never. */
  pricedAt: number;
  lookups: Record<string, Lookup>;
}

// Saved so the shopping list still works after a reload, e.g. on a phone at the store.
const pricesStore = createLocalStore<SavedPrices>(
  "commander-ph:prices",
  { pricedAt: 0, lookups: {} },
  (v): v is SavedPrices =>
    typeof (v as SavedPrices)?.pricedAt === "number" && typeof (v as SavedPrices)?.lookups === "object",
);

// Lowercased names of cards ticked off as bought.
const boughtStore = createLocalStore<string[]>(
  "commander-ph:bought",
  [],
  (v): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string"),
);

// Type line and mana cost per card, keyed by lower-cased name. null = Scryfall
// doesn't know the name, so it isn't asked again.
const infoStore = createLocalStore<Record<string, CardInfo | null>>(
  "commander-ph:card-info",
  {},
  (v): v is Record<string, CardInfo | null> => typeof v === "object" && v !== null && !Array.isArray(v),
  { cache: true },
);

const infoKey = (name: string) => name.trim().toLowerCase();
// Names already being looked up this visit, so two renders don't ask twice.
const infoRequested = new Set<string>();

/**
 * Type line, mana cost and colors for every card in the deck, looked up in one
 * request for the cards not seen before (retried if busy) and saved here.
 */
export function useCardInfo(deck: DeckCard[]): (name: string) => CardInfo | undefined {
  const info = infoStore.useValue();
  const missing = deck.map((c) => c.name).filter((n) => !(infoKey(n) in info) && !infoRequested.has(infoKey(n)));
  const missingKey = missing.join("\n");

  useEffect(() => {
    if (!missingKey) return;
    const names = missingKey.split("\n");
    names.forEach((n) => infoRequested.add(infoKey(n)));
    const controller = new AbortController();
    void fetchJsonWithRetry<{ cards: Record<string, CardInfo> }>("/api/cards/info", {
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names }) },
      signal: controller.signal,
      busyReason: "Scryfall is busy",
    })
      .then((result) => {
        if (result === "error") return;
        const merged = { ...infoStore.get() };
        for (const n of names) merged[infoKey(n)] = result.cards[n] ?? null;
        infoStore.set(merged);
      })
      .catch(() => {})
      .finally(() => names.forEach((n) => infoRequested.delete(infoKey(n))));
    return () => controller.abort();
  }, [missingKey]);

  return (name) => info[infoKey(name)] ?? undefined;
}

/** The saved deck, plus edits that every component using it sees immediately. */
export function useDeck() {
  const deck = deckStore.useValue();
  const ready = useHydrated();

  return {
    deck,
    ready,
    add: (name: string) => deckStore.set(addCard(deckStore.get(), name)),
    remove: (name: string) => deckStore.set(removeCard(deckStore.get(), name)),
    swap: (from: string, to: string) => deckStore.set(swapCard(deckStore.get(), from, to)),
    importCards: (cards: DeckCard[]) => deckStore.set(importCards(deckStore.get(), cards)),
    clear: () => {
      deckStore.set([]);
      pricesStore.set({ pricedAt: 0, lookups: {} });
      boughtStore.set([]);
    },
  };
}

export function useSavedPrices() {
  const saved = pricesStore.useValue();
  return {
    ...saved,
    /** Records one card's result as it arrives. */
    record: (name: string, lookup: Lookup) => {
      const current = pricesStore.get();
      pricesStore.set({ ...current, lookups: { ...current.lookups, [name]: lookup } });
    },
    markDone: () => pricesStore.set({ ...pricesStore.get(), pricedAt: Date.now() }),
  };
}

export function useBought() {
  const bought = boughtStore.useValue();
  const key = (name: string) => name.trim().toLowerCase();
  return {
    isBought: (name: string) => bought.includes(key(name)),
    toggle: (name: string) => {
      const current = boughtStore.get();
      boughtStore.set(current.includes(key(name)) ? current.filter((n) => n !== key(name)) : [...current, key(name)]);
    },
    reset: () => boughtStore.set([]),
  };
}
