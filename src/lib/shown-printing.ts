"use client";

// Which printing a card page shows at the top, after a click in its Printings
// section. Kept for this visit only, per card, so other cards are unaffected.
import { useSyncExternalStore } from "react";

export interface ShownPrinting {
  /** The printing's key in the Printings grid, e.g. "CMM#410". */
  key: string;
  /** e.g. "Commander Masters · CMM #410" */
  label: string;
  /** A large image of this printing. */
  imageUrl: string;
  /** Just its artwork, for the page background (Scryfall printings only). */
  artUrl?: string;
}

interface State {
  card: string;
  printing: ShownPrinting | null;
  /** Bumped on every click, so the page can scroll up to show it. */
  clicks: number;
}

let state: State | null = null;
const listeners = new Set<() => void>();

/** Shows a printing at the top of the card page; null goes back to the default image. */
export function showPrinting(card: string, printing: ShownPrinting | null) {
  state = { card, printing, clicks: (state?.clicks ?? 0) + 1 };
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The printing chosen for this card, if any, and a click counter. */
export function useShownPrinting(card: string): { printing: ShownPrinting | null; clicks: number } {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );
  return current?.card === card ? { printing: current.printing, clicks: current.clicks } : { printing: null, clicks: 0 };
}
