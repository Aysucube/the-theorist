"use client";

import { requestRulings, useRulings } from "@/lib/deck-beta/store";
import type { CardDetails } from "@/lib/types";
import { RulingsList } from "../rulings-list";

/** The selected card's official rulings, loaded when first shown, in a scrolling box. */
export function BetaRulings({ card, size }: { card: CardDetails; size?: "sm" | "md" }) {
  const state = useRulings(card);

  if (!state || state.state === "loading" || state.state === "waiting") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className="size-4 spinner" />
        {state?.state === "waiting"
          ? `Waiting ${state.seconds}s because ${state.reason}, then trying again…`
          : "Loading rulings…"}
      </p>
    );
  }
  if (state.state === "error") {
    return (
      <p className="text-xs text-muted">
        Couldn’t load rulings after several tries.{" "}
        <button type="button" onClick={() => requestRulings(card)} className="link">
          Try again
        </button>
      </p>
    );
  }
  if (!state.result.found) return <p className="text-xs text-muted">Scryfall couldn’t find this card’s rulings.</p>;
  return <RulingsList rulings={state.result.rulings} size={size} />;
}
