"use client";

import { useMemo } from "react";
import { isBasicLandName } from "@/lib/binder/collection";
import { useBinder } from "@/lib/binder/store";
import { builderRecommendations, type BuilderCandidate } from "@/lib/builder/plan";
import type { Bracket, BracketReport } from "@/lib/deck-beta/bracket";
import { commanderCurve } from "@/lib/deck-beta/curve";
import { spellCutOrder } from "@/lib/deck-beta/deck-size";
import { cardKey } from "@/lib/deck-beta/recommend";
import { useBuilderData, useTargetBracket } from "@/lib/deck-beta/store";
import type { DeckAnalysis } from "@/lib/deck-beta/synergy";
import type { CardDetails, DeckCombos } from "@/lib/types";
import { useGameChangers } from "@/lib/use-game-changers";

/**
 * What a deck wants from here, by the builder's rules and EDHREC's decks for its
 * commander: what to add, and what could go. Without EDHREC (no commander, or it
 * can't be reached) it's worked out from the deck alone.
 */
export function useDeckPlan({
  commander,
  deckCards,
  analysis,
  report,
  combos,
}: {
  commander?: CardDetails;
  deckCards: { card: CardDetails; qty: number }[];
  analysis: DeckAnalysis;
  report: BracketReport;
  combos: DeckCombos | null | undefined;
}) {
  const binder = useBinder();
  const gameChangers = useGameChangers();
  const [chosenBracket] = useTargetBracket();
  const builder = useBuilderData(commander ? { name: commander.name, layout: commander.layout } : undefined);
  const data = builder?.state === "done" && builder.result.found ? builder.result : null;
  // Cuts read from the deck alone can name its best cards, so anything that suggests cuts waits for this.
  const loading = Boolean(commander) && (builder === undefined || builder.state === "loading" || builder.state === "waiting");
  const identity = commander?.colorIdentity ?? analysis.colors;
  const deckKey = deckCards.map((d) => `${d.card.name}×${d.qty}`).join("\n");

  const plan = useMemo(() => {
    const candidates: BuilderCandidate[] = (data?.cards ?? []).flatMap((c) => {
      const card = data?.details[c.name];
      return card && !isBasicLandName(card.name) ? [{ card, synergy: c.synergy, inclusion: c.inclusion, lists: c.lists, ownedCopies: binder.owned(card.name) }] : [];
    });
    return builderRecommendations({
      deck: deckCards,
      candidates: candidates.filter((c) => cardKey(c.card.name) !== cardKey(commander?.name ?? "")),
      identity,
      bracket: (chosenBracket || report.bracket) as Bracket,
      isGameChanger: gameChangers.has,
      combos,
      curve: commanderCurve(data),
      preferOwned: false,
      commander: commander?.name,
    });
    // The deck key captures the deck's cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, deckKey, commander, chosenBracket, report.bracket, combos, gameChangers, binder.cards]);

  const spellCuts = useMemo(() => spellCutOrder(plan.curveSlots), [plan]);
  return { data, loading, plan, identity, spellCuts };
}
