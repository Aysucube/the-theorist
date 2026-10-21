"use client";

// Deck beta's own saved deck and card details. They use their own storage
// keys and loaders, so nothing here reads or changes the shopping list.
import { useEffect, useSyncExternalStore } from "react";
import { importCards, MAX_DECK_CARDS, removeCard, type DeckCard } from "@/lib/deck";
import { createLocalStore, useHydrated } from "@/lib/local-store";
import { fetchJsonWithRetry, sleep } from "@/lib/retry";
import type { CardDetails } from "@/lib/types";
import type { AnalysisResponse, CardsResponse, PairingsResponse, PlaystyleResponse, RulingsResponse } from "./api";

function isDeckCard(value: unknown): value is DeckCard {
  const card = value as DeckCard;
  return typeof card?.name === "string" && Number.isInteger(card.qty) && card.qty > 0;
}

const deckStore = createLocalStore<DeckCard[]>(
  "commander-ph:deck-beta",
  [],
  (v): v is DeckCard[] => Array.isArray(v) && v.every(isDeckCard),
);

// Keyed by lower-cased name as typed. null = Scryfall doesn't know the name.
// (v2: details now include power and toughness, to tell which cards can be a commander.)
const detailsStore = createLocalStore<Record<string, CardDetails | null>>(
  "commander-ph:deck-beta-cards-v2",
  {},
  (v): v is Record<string, CardDetails | null> => typeof v === "object" && v !== null && !Array.isArray(v),
);

const detailsKey = (name: string) => name.trim().toLowerCase();

export function useBetaDeck() {
  const deck = deckStore.useValue();
  const ready = useHydrated();
  return {
    deck,
    ready,
    /** Replaces the whole deck with a pasted list. */
    replace: (cards: DeckCard[]) => deckStore.set(importCards([], cards)),
    /** Adds pasted cards; a card already in the deck takes the pasted quantity. */
    addList: (cards: DeckCard[]) => deckStore.set(importCards(deckStore.get(), cards)),
    /** Adds one card, saving its details if we have them so it shows up at once. */
    add: (card: CardDetails) => {
      const current = deckStore.get();
      if (current.some((c) => detailsKey(c.name) === detailsKey(card.name)) || current.length >= MAX_DECK_CARDS) return;
      detailsStore.set({ ...detailsStore.get(), [detailsKey(card.name)]: card });
      deckStore.set([...current, { name: card.name, qty: 1 }]);
    },
    remove: (name: string) => deckStore.set(removeCard(deckStore.get(), name)),
    clear: () => deckStore.set([]),
  };
}

// --- Card details -------------------------------------------------------------

export type LoadStatus =
  | { state: "idle" }
  | { state: "loading"; count: number }
  | { state: "waiting"; seconds: number; reason: string };

let status: LoadStatus = { state: "idle" };
const statusListeners = new Set<() => void>();
const wanted = new Set<string>();
let loading = false;

function setStatus(next: LoadStatus) {
  status = next;
  statusListeners.forEach((notify) => notify());
}

/** After the usual retries give up, wait this long and start over: the page keeps trying while it's open. */
const ROUND_PAUSE_MS = 60_000;

async function loadMissing() {
  if (loading) return;
  loading = true;
  for (;;) {
    const saved = detailsStore.get();
    const missing = [...wanted].filter((n) => !(detailsKey(n) in saved)).slice(0, MAX_DECK_CARDS);
    if (missing.length === 0) break;

    setStatus({ state: "loading", count: missing.length });
    const result = await fetchJsonWithRetry<CardsResponse>("/api/deck-beta/cards", {
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names: missing }) },
      onWait: (ms, reason) => setStatus({ state: "waiting", seconds: Math.round(ms / 1000), reason }),
      busyReason: "Scryfall is busy",
    });
    if (result === "error") {
      setStatus({ state: "waiting", seconds: ROUND_PAUSE_MS / 1000, reason: "Scryfall still isn’t answering" });
      await sleep(ROUND_PAUSE_MS);
      continue;
    }
    const next = { ...detailsStore.get() };
    for (const name of missing) next[detailsKey(name)] = result.cards[name] ?? null;
    detailsStore.set(next);
  }
  loading = false;
  setStatus({ state: "idle" });
}

function subscribeStatus(notify: () => void) {
  statusListeners.add(notify);
  return () => statusListeners.delete(notify);
}

/**
 * Details (artwork, types, colors, rules text) for every card in the deck,
 * fetched for cards not seen before and saved in this browser. Keeps trying
 * until they arrive: getting every card matters more than speed.
 */
export function useBetaDetails(deck: DeckCard[]) {
  const details = detailsStore.useValue();
  const loadStatus = useSyncExternalStore(subscribeStatus, () => status, () => status);
  const missingKey = deck
    .map((c) => c.name)
    .filter((n) => !(detailsKey(n) in details))
    .join("\n");

  useEffect(() => {
    if (!missingKey) return;
    missingKey.split("\n").forEach((n) => wanted.add(n));
    void loadMissing();
  }, [missingKey]);

  return {
    /** undefined while loading; null when Scryfall doesn't know the name. */
    detailsFor: (name: string): CardDetails | null | undefined => details[detailsKey(name)],
    status: loadStatus,
  };
}

// --- EDHREC pairings ------------------------------------------------------------

export type PairingsState =
  | { state: "loading" }
  | { state: "waiting"; seconds: number; reason: string }
  | { state: "done"; result: PairingsResponse }
  | { state: "error" };

const pairings = new Map<string, PairingsState>();
const pairingListeners = new Set<() => void>();
let pairingsVersion = 0;

function setPairings(key: string, state: PairingsState) {
  pairings.set(key, state);
  pairingsVersion++;
  pairingListeners.forEach((notify) => notify());
}

/** Rounds of retries before the page stops on its own and offers a button. */
const PAIRING_ROUNDS = 3;

async function loadPairings(card: CardDetails) {
  const key = detailsKey(card.name);
  const url = `/api/deck-beta/pairings?${new URLSearchParams({ name: card.name, layout: card.layout })}`;
  for (let round = 0; round < PAIRING_ROUNDS; round++) {
    setPairings(key, { state: "loading" });
    const result = await fetchJsonWithRetry<PairingsResponse>(url, {
      onWait: (ms, reason) => setPairings(key, { state: "waiting", seconds: Math.round(ms / 1000), reason }),
      busyReason: "EDHREC or Scryfall is busy",
    });
    if (result !== "error") return setPairings(key, { state: "done", result });
    if (round < PAIRING_ROUNDS - 1) {
      setPairings(key, { state: "waiting", seconds: ROUND_PAUSE_MS / 1000, reason: "EDHREC still isn’t answering" });
      await sleep(ROUND_PAUSE_MS);
    }
  }
  setPairings(key, { state: "error" });
}

/** Starts (or restarts, after an error) loading a card's EDHREC pairings. */
export function requestPairings(card: CardDetails) {
  const current = pairings.get(detailsKey(card.name));
  if (current && current.state !== "error") return;
  void loadPairings(card);
}

function subscribePairings(notify: () => void) {
  pairingListeners.add(notify);
  return () => pairingListeners.delete(notify);
}

// --- Rulings ------------------------------------------------------------------

export type RulingsState =
  | { state: "loading" }
  | { state: "waiting"; seconds: number; reason: string }
  | { state: "done"; result: RulingsResponse }
  | { state: "error" };

const rulings = new Map<string, RulingsState>();

function setRulings(key: string, state: RulingsState) {
  rulings.set(key, state);
  // Shares the pairings' listeners: both are "this card's extra data changed".
  pairingsVersion++;
  pairingListeners.forEach((notify) => notify());
}

/** Starts (or restarts, after an error) loading a card's rulings. */
export function requestRulings(card: CardDetails) {
  const key = detailsKey(card.name);
  const current = rulings.get(key);
  if (current && current.state !== "error") return;
  setRulings(key, { state: "loading" });
  void fetchJsonWithRetry<RulingsResponse>(`/api/deck-beta/rulings?${new URLSearchParams({ name: card.name })}`, {
    onWait: (ms, reason) => setRulings(key, { state: "waiting", seconds: Math.round(ms / 1000), reason }),
    busyReason: "Scryfall is busy",
  }).then((result) => setRulings(key, result === "error" ? { state: "error" } : { state: "done", result }));
}

/** A card's official rulings, loaded on first ask. */
export function useRulings(card: CardDetails | null | undefined): RulingsState | undefined {
  useSyncExternalStore(subscribePairings, () => pairingsVersion, () => 0);
  useEffect(() => {
    if (card) requestRulings(card);
  }, [card]);
  return card ? rulings.get(detailsKey(card.name)) : undefined;
}

/** A card's EDHREC pairings, loaded on first ask. */
export function usePairings(card: CardDetails | null | undefined): PairingsState | undefined {
  useSyncExternalStore(subscribePairings, () => pairingsVersion, () => 0);
  useEffect(() => {
    if (card) requestPairings(card);
  }, [card]);
  return card ? pairings.get(detailsKey(card.name)) : undefined;
}

// --- Commander -------------------------------------------------------------------

// The commander chosen for the pasted deck, by name; "" = pick automatically.
const commanderStore = createLocalStore<string>(
  "commander-ph:deck-beta-commander",
  "",
  (v): v is string => typeof v === "string",
);

export function useChosenCommander(): [string, (name: string) => void] {
  return [commanderStore.useValue(), commanderStore.set];
}

// --- Deck analysis and playstyles ---------------------------------------------------

export type RemoteState<T> =
  | { state: "loading" }
  | { state: "waiting"; seconds: number; reason: string }
  | { state: "done"; result: T }
  | { state: "error" };

// Results of the slower lookups, kept for this visit by request.
const remote = new Map<string, RemoteState<unknown>>();

function setRemote(key: string, state: RemoteState<unknown>) {
  remote.set(key, state);
  // Shares the pairings' listeners: all of these are "extra data for the deck changed".
  pairingsVersion++;
  pairingListeners.forEach((notify) => notify());
}

function loadRemote<T>(
  key: string,
  url: string,
  init: RequestInit | undefined,
  busyReason: string,
  force = false,
  onDone?: (result: T) => void,
) {
  const current = remote.get(key);
  if (current && current.state !== "error" && !force) return;
  setRemote(key, { state: "loading" });
  void fetchJsonWithRetry<T>(url, {
    init,
    onWait: (ms, reason) => setRemote(key, { state: "waiting", seconds: Math.round(ms / 1000), reason }),
    busyReason,
  }).then((result) => {
    if (result !== "error") onDone?.(result);
    setRemote(key, result === "error" ? { state: "error" } : { state: "done", result });
  });
}

function analysisRequest(commander: CardDetails, cards: string[]) {
  const sorted = [...new Set(cards)].sort();
  return {
    key: `analysis\n${commander.name}\n${sorted.join("\n")}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commander: commander.name, layout: commander.layout, cards: sorted }),
    },
  };
}

// The last finished analysis per commander, shown while a changed deck is re-analyzed.
const latestAnalysis = new Map<string, AnalysisResponse>();

/** Starts (or, with force, repeats) the deck's analysis: its combos and its commander's playstyles. */
export function requestAnalysis(commander: CardDetails, cards: string[], force = false) {
  const { key, init } = analysisRequest(commander, cards);
  loadRemote<AnalysisResponse>(key, "/api/deck-beta/analysis", init, "Commander Spellbook or EDHREC is busy", force, (result) =>
    latestAnalysis.set(commander.name, result),
  );
}

/** The most recent finished analysis for this commander, even for an earlier version of the deck. */
export function latestAnalysisFor(commander: CardDetails | undefined): AnalysisResponse | undefined {
  return commander ? latestAnalysis.get(commander.name) : undefined;
}

/** The deck's combos (Commander Spellbook) and its commander's playstyles (EDHREC). */
export function useDeckAnalysis(commander: CardDetails | undefined, cards: string[]): RemoteState<AnalysisResponse> | undefined {
  useSyncExternalStore(subscribePairings, () => pairingsVersion, () => 0);
  const key = commander ? analysisRequest(commander, cards).key : "";
  useEffect(() => {
    if (commander && key) requestAnalysis(commander, key.split("\n").slice(2));
    // The key captures everything the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key ? (remote.get(key) as RemoteState<AnalysisResponse> | undefined) : undefined;
}

function playstyleUrl(commander: CardDetails, theme: string) {
  return `/api/deck-beta/playstyle?${new URLSearchParams({ commander: commander.name, layout: commander.layout, theme })}`;
}

export function requestPlaystyle(commander: CardDetails, theme: string, force = false) {
  const url = playstyleUrl(commander, theme);
  loadRemote<PlaystyleResponse>(url, url, undefined, "EDHREC is busy", force);
}

/** The best cards for one of the commander's playstyles. */
export function usePlaystyle(commander: CardDetails | undefined, theme: string | undefined): RemoteState<PlaystyleResponse> | undefined {
  useSyncExternalStore(subscribePairings, () => pairingsVersion, () => 0);
  const url = commander && theme ? playstyleUrl(commander, theme) : "";
  useEffect(() => {
    if (commander && theme) requestPlaystyle(commander, theme);
  }, [commander, theme]);
  return url ? (remote.get(url) as RemoteState<PlaystyleResponse> | undefined) : undefined;
}
