"use client";

// The deck being made in Create Commander Deck, saved in this browser as it
// grows so a reload (or a visit to the binder) picks up where it left off.
import type { DeckCard } from "@/lib/deck";
import type { Bracket } from "@/lib/deck-beta/bracket";
import { createLocalStore, useHydrated } from "@/lib/local-store";

export const STEPS = ["Commander", "Playstyle", "Bracket", "Synergies", "Lands", "Build", "Mana curve", "Finish"] as const;
/** Each step's place in STEPS. */
export const STEP = { commander: 0, playstyle: 1, bracket: 2, synergies: 3, lands: 4, build: 5, curve: 6, finish: 7 } as const;
/** How many playstyles a deck can combine. */
export const MAX_PLAYSTYLES = 3;

export interface DraftCommander {
  name: string;
  layout: string;
  colorIdentity: string[];
  imageUrl?: string;
  cmc: number;
}

/** One of EDHREC's playstyles for the commander. */
export interface DraftPlaystyle {
  slug: string;
  name: string;
}

export interface BuilderDraft {
  /** 0-based index into STEPS. */
  step: number;
  commander?: DraftCommander;
  bracket?: Bracket;
  /** The playstyles chosen, up to MAX_PLAYSTYLES; none for a balanced deck. */
  themes: DraftPlaystyle[];
  /** Lands to run, basics and others together. */
  lands?: number;
  /** Every card but the commander and the basic lands. */
  cards: DeckCard[];
  /** Rank cards from the binder ahead. */
  preferOwned: boolean;
  name: string;
}

const EMPTY: BuilderDraft = { step: 0, themes: [], cards: [], preferOwned: true, name: "" };

const isDraft = (v: unknown): v is BuilderDraft => {
  const draft = v as BuilderDraft;
  return typeof v === "object" && v !== null && Number.isInteger(draft.step) && Array.isArray(draft.cards) && Array.isArray(draft.themes);
};

const draftStore = createLocalStore<BuilderDraft>("commander-ph:builder-draft", EMPTY, isDraft, {
  // Drafts from before several playstyles could be chosen held just one.
  repair: (v) => {
    const old = v as Partial<BuilderDraft> & { theme?: string; themeName?: string };
    if (typeof v !== "object" || v === null || !Number.isInteger(old.step) || !Array.isArray(old.cards)) return undefined;
    const { theme, themeName, ...rest } = old;
    return { ...EMPTY, ...rest, themes: theme ? [{ slug: theme, name: themeName ?? theme }] : [] };
  },
});

const key = (name: string) => name.trim().toLowerCase();

/** Adds a playstyle, or takes it off if it's chosen; a full list is left as it is. */
export function togglePlaystyle(themes: DraftPlaystyle[], theme: DraftPlaystyle): DraftPlaystyle[] {
  if (themes.some((t) => t.slug === theme.slug)) return themes.filter((t) => t.slug !== theme.slug);
  return themes.length < MAX_PLAYSTYLES ? [...themes, theme] : themes;
}

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
