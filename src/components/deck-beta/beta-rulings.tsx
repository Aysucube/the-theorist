"use client";

import { requestRulings, useRulings } from "@/lib/deck-beta/store";
import type { CardDetails } from "@/lib/types";
import { RulingsList } from "../rulings-list";

/** The selected card's official rulings, loaded when first shown, in a scrolling box. */
export function BetaRulings({ card, size }: { card: CardDetails; size?: "sm" | "md" }) {
  const state = useRulings(card);

  if (!state || state.state === "loading" || state.state === "waiting") {
    return (
      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500 dark:border-zinc-600 dark:border-t-amber-400" />
        {state?.state === "waiting"
          ? `Waiting ${state.seconds}s because ${state.reason}, then trying again…`
          : "Loading rulings…"}
      </p>
    );
  }
  if (state.state === "error") {
    return (
      <p className="text-xs text-zinc-500">
        Couldn’t load rulings after several tries.{" "}
        <button type="button" onClick={() => requestRulings(card)} className="text-amber-700 underline dark:text-amber-400">
          Try again
        </button>
      </p>
    );
  }
  if (!state.result.found) return <p className="text-xs text-zinc-500">Scryfall couldn’t find this card’s rulings.</p>;
  return <RulingsList rulings={state.result.rulings} size={size} />;
}
