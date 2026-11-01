"use client";

// Card details (types, colors, rules text, art) for the Binder, the deck
// builder and My Decks, kept in IndexedDB: a collection can run to thousands
// of cards, more than localStorage holds. Missing cards are fetched from
// Scryfall 150 at a time, waiting out busy spells, until every one is known.
import { useEffect, useSyncExternalStore } from "react";
import { fetchJsonWithRetry, sleep } from "@/lib/retry";
import type { CardsResponse } from "@/lib/deck-beta/api";
import type { CardDetails } from "@/lib/types";

const DB_NAME = "the-theorist";
const STORE = "cards";
/** The details route takes this many names per request. */
const BATCH = 150;
const ROUND_PAUSE_MS = 60_000;

const key = (name: string) => name.trim().toLowerCase();

// Everything known so far, by lower-cased name. null = Scryfall doesn't know the name.
const memory = new Map<string, CardDetails | null>();
let version = 0;
const listeners = new Set<() => void>();
function notify() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

let db: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      // Blocked storage (some private windows): keep everything in memory for this visit.
      resolve(null);
    }
  });
  return db;
}

let restored: Promise<void> | null = null;
/** Loads what earlier visits saved, once. */
function restore(): Promise<void> {
  restored ??= openDb().then(
    (database) =>
      new Promise<void>((resolve) => {
        if (!database) return resolve();
        const tx = database.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const keys = store.getAllKeys();
        const values = store.getAll();
        tx.oncomplete = () => {
          keys.result.forEach((k, i) => memory.set(String(k), values.result[i] as CardDetails | null));
          notify();
          resolve();
        };
        tx.onerror = () => resolve();
      }),
  );
  return restored;
}

async function save(entries: [string, CardDetails | null][]) {
  const database = await openDb();
  if (!database) return;
  const tx = database.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const [k, v] of entries) store.put(v, k);
}

export type CacheStatus =
  | { state: "idle" }
  | { state: "loading"; pending: number }
  | { state: "waiting"; pending: number; seconds: number; reason: string };

let status: CacheStatus = { state: "idle" };
function setStatus(next: CacheStatus) {
  status = next;
  notify();
}

const wanted = new Set<string>();
let running = false;

async function run() {
  if (running) return;
  running = true;
  await restore();
  for (;;) {
    const missing = [...wanted].filter((n) => !memory.has(key(n)));
    if (missing.length === 0) break;
    const batch = missing.slice(0, BATCH);
    setStatus({ state: "loading", pending: missing.length });
    const result = await fetchJsonWithRetry<CardsResponse>("/api/deck-beta/cards", {
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names: batch }) },
      onWait: (ms, reason) => setStatus({ state: "waiting", pending: missing.length, seconds: Math.round(ms / 1000), reason }),
      busyReason: "Scryfall is busy",
    });
    if (result === "error") {
      setStatus({ state: "waiting", pending: missing.length, seconds: ROUND_PAUSE_MS / 1000, reason: "Scryfall still isn’t answering" });
      await sleep(ROUND_PAUSE_MS);
      continue;
    }
    const entries = batch.map((n): [string, CardDetails | null] => [key(n), result.cards[n] ?? null]);
    entries.forEach(([k, v]) => memory.set(k, v));
    void save(entries);
    notify();
  }
  running = false;
  setStatus({ state: "idle" });
}

/** Adds details fetched elsewhere (e.g. with EDHREC's recommendations) so they show at once. */
export function rememberDetails(cards: CardDetails[]) {
  const entries = cards.map((c): [string, CardDetails | null] => [key(c.name), c]);
  entries.forEach(([k, v]) => memory.set(k, v));
  void save(entries);
  notify();
}

/**
 * Details for every name asked for, fetched for the ones not seen before and
 * saved in this browser. `detailsFor` is undefined while a card is loading and
 * null when Scryfall doesn't know the name.
 */
export function useCardDetails(names: string[]) {
  const known = useSyncExternalStore(subscribe, () => version, () => 0);
  const current = useSyncExternalStore(subscribe, () => status, () => status);
  const missingKey = names.filter((n) => !memory.has(key(n))).join("\n");

  useEffect(() => {
    void restore();
  }, []);
  useEffect(() => {
    if (!missingKey) return;
    missingKey.split("\n").forEach((n) => wanted.add(n));
    void run();
  }, [missingKey]);

  return {
    detailsFor: (name: string): CardDetails | null | undefined => memory.get(key(name)),
    status: current,
    /** Changes whenever more details are known, including when a saved copy loads. */
    known,
  };
}
