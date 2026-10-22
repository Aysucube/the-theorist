"use client";

import { useEffect } from "react";
import { gameChangerKeys, isGameChangerIn } from "@/lib/game-changers";
import { createLocalStore } from "@/lib/local-store";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { CardDetails } from "@/lib/types";

// The Game Changers list, saved in this browser and refreshed once a day.
interface Saved {
  fetchedAt: number;
  cards: CardDetails[];
}

const store = createLocalStore<Saved | null>(
  "commander-ph:game-changers",
  null,
  (v): v is Saved | null => v === null || (typeof (v as Saved).fetchedAt === "number" && Array.isArray((v as Saved).cards)),
);

const DAY_MS = 24 * 60 * 60 * 1000;
let requested = false;

async function refresh() {
  const result = await fetchJsonWithRetry<{ cards: CardDetails[] }>("/api/game-changers", { busyReason: "Scryfall is busy" });
  if (result !== "error" && result.cards.length > 0) store.set({ fetchedAt: Date.now(), cards: result.cards });
  else requested = false;
}

export interface GameChangers {
  /** True once the list has loaded (from this browser or Scryfall). */
  ready: boolean;
  cards: CardDetails[];
  has: (name: string) => boolean;
}

// Built once per saved list and shared, since every label on the page asks.
let built: { from: Saved | null; value: GameChangers } | undefined;

function lookupFor(saved: Saved | null): GameChangers {
  if (built?.from === saved) return built.value;
  const cards = saved?.cards ?? [];
  const keys = gameChangerKeys(cards.map((c) => c.name));
  built = { from: saved, value: { ready: cards.length > 0, cards, has: (name: string) => isGameChangerIn(keys, name) } };
  return built.value;
}

/** The Game Changers list, loaded once and shared by every component. */
export function useGameChangers(): GameChangers {
  const saved = store.useValue();
  const fetchedAt = saved?.fetchedAt ?? 0;
  useEffect(() => {
    if (requested || Date.now() - fetchedAt < DAY_MS) return;
    requested = true;
    void refresh();
  }, [fetchedAt]);
  return lookupFor(saved);
}
