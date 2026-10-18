"use client";

// One shared queue of "Check ₱" lookups for this visit. Single clicks and
// "Load All Prices" both go through it, one card at a time with a short
// pause, waiting out busy sources (see lookupPrice), so a list of 50 cards
// trickles in politely and every row showing the same card stays in sync.
import { useSyncExternalStore } from "react";
import { lookupPrice, sleep, type Lookup } from "./price-lookup";

export type PriceState =
  | { status: "idle" }
  | { status: "queued" }
  | { status: "loading" }
  | { status: "waiting"; seconds: number; reason: string }
  | { status: "done"; result: Lookup };

const PAUSE_BETWEEN_CARDS_MS = 400;
const IDLE: PriceState = { status: "idle" };

const states = new Map<string, PriceState>();
const queue: string[] = [];
const listeners = new Set<() => void>();
// Bumped on every change so components re-read the map.
let version = 0;
let running = false;

function set(name: string, state: PriceState) {
  states.set(name, state);
  version++;
  listeners.forEach((notify) => notify());
}

export function getPriceState(name: string): PriceState {
  return states.get(name) ?? IDLE;
}

async function run() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const name = queue.shift()!;
    set(name, { status: "loading" });
    const result = await lookupPrice(name, {
      onWait: (ms, reason) => set(name, { status: "waiting", seconds: Math.round(ms / 1000), reason }),
    });
    set(name, { status: "done", result });
    if (queue.length > 0) await sleep(PAUSE_BETWEEN_CARDS_MS);
  }
  running = false;
}

/**
 * Queues price checks. Cards already checked (or on their way) are skipped,
 * except failed ones, which are tried again. `first` puts them at the front,
 * for a single "Check ₱" click while a long list is loading.
 */
export function checkPrices(names: string[], { first = false } = {}) {
  const fresh = names.filter((name) => {
    const state = getPriceState(name);
    return state.status === "idle" || (state.status === "done" && state.result === "error");
  });
  if (fresh.length === 0) return;
  fresh.forEach((name) => set(name, { status: "queued" }));
  if (first) queue.unshift(...fresh);
  else queue.push(...fresh);
  void run();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Re-renders on any price change; read states with getPriceState(name). */
export function usePriceQueue(): typeof getPriceState {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  return getPriceState;
}
