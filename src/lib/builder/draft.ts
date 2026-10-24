"use client";

// The deck being made in Create Commander Deck, saved in this browser as it
// grows so a reload (or a visit to the binder) picks up where it left off.
import type { DeckCard } from "@/lib/deck";
import type { Bracket } from "@/lib/deck-beta/bracket";
import { createLocalStore, useHydrated } from "@/lib/local-store";

export const STEPS = ["Commander", "Bracket", "Synergies", "Lands", "Build", "Finish"] as const;

export interface DraftCommander {
  name: string;
  layout: string;
  colorIdentity: string[];
  imageUrl?: string;
  cmc: number;
}

export interface BuilderDraft {
  /** 0-based index into STEPS. */
  step: number;
  commander?: DraftCommander;
  bracket?: Bracket;
  /** The EDHREC playstyle's slug, or "" for a balanced deck. */
  theme: string;
  themeName?: string;
  /** Lands to run, basics and others together. */
  lands?: number;
  /** Every card but the commander and the basic lands. */
  cards: DeckCard[];
  /** Rank cards from the binder ahead. */
  preferOwned: boolean;
  name: string;
}

const EMPTY: BuilderDraft = { step: 0, theme: "", cards: [], preferOwned: true, name: "" };

const draftStore = createLocalStore<BuilderDraft>(
  "commander-ph:builder-draft",
  EMPTY,
  (v): v is BuilderDraft =>
    typeof v === "object" && v !== null && Number.isInteger((v as BuilderDraft).step) && Array.isArray((v as BuilderDraft).cards),
);

const key = (name: string) => name.trim().toLowerCase();

export function useBuilderDraft() {
  const draft = draftStore.useValue();
  const ready = useHydrated();
  const update = (patch: Partial<BuilderDraft>) => draftStore.set({ ...draftStore.get(), ...patch });
  return {
    draft,
    ready,
    update,
    /** Picks a commander, starting the deck over if it's a different one. */
    chooseCommander: (commander: DraftCommander) => {
      const current = draftStore.get();
      draftStore.set(
        current.commander?.name === commander.name ? { ...current, commander } : { ...EMPTY, commander, preferOwned: current.preferOwned },
      );
    },
    addCard: (name: string) => {
      const current = draftStore.get();
      if (current.cards.some((c) => key(c.name) === key(name))) return;
      draftStore.set({ ...current, cards: [...current.cards, { name, qty: 1 }] });
    },
    removeCard: (name: string) => {
      const current = draftStore.get();
      draftStore.set({ ...current, cards: current.cards.filter((c) => key(c.name) !== key(name)) });
    },
    reset: () => draftStore.set({ ...EMPTY, preferOwned: draftStore.get().preferOwned }),
  };
}
