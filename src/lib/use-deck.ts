"use client";

import { useSyncExternalStore } from "react";
import { addCard, importCards, removeCard, type DeckCard } from "@/lib/deck";

// The deck lives in this browser's localStorage: no account needed, but it
// doesn't follow the user to another device or browser.
const STORAGE_KEY = "commander-ph:deck";
const EMPTY: DeckCard[] = [];

const listeners = new Set<() => void>();
let cached: DeckCard[] | null = null;

function isDeckCard(value: unknown): value is DeckCard {
  const card = value as DeckCard;
  return typeof card?.name === "string" && Number.isInteger(card.qty) && card.qty > 0;
}

function read(): DeckCard[] {
  if (cached) return cached;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    cached = Array.isArray(parsed) ? parsed.filter(isDeckCard) : EMPTY;
  } catch {
    // Private mode or blocked storage: start empty rather than fail.
    cached = EMPTY;
  }
  return cached;
}

function write(deck: DeckCard[]) {
  cached = deck;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  } catch {
    // Storage can be full or blocked; the deck still works until the page closes.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  // Keep other tabs in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cached = null;
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

const noSubscribe = () => () => {};

/** The saved deck, plus edits that every component using it sees immediately. */
export function useDeck() {
  const deck = useSyncExternalStore(subscribe, read, () => EMPTY);
  // False during the server render and hydration, so pages don't flash "empty deck".
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);

  return {
    deck,
    ready,
    add: (name: string) => write(addCard(read(), name)),
    remove: (name: string) => write(removeCard(read(), name)),
    importCards: (cards: DeckCard[]) => write(importCards(read(), cards)),
    clear: () => write([]),
  };
}
