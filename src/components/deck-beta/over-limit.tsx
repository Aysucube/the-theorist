"use client";

import { useMemo, useState } from "react";
import type { BracketReport } from "@/lib/deck-beta/bracket";
import type { BalanceCut } from "@/lib/deck-beta/color-balance";
import { DECK_SIZE } from "@/lib/deck-beta/color-balance";
import { groupCuts, overCuts } from "@/lib/deck-beta/deck-size";
import type { DeckProfile } from "@/lib/deck-beta/roles";
import type { DeckSource } from "@/lib/deck-beta/store";
import type { DeckAnalysis } from "@/lib/deck-beta/synergy";
import { formatCount } from "@/lib/format";
import type { CardDetails, DeckCombos } from "@/lib/types";
import { useHoverPreview } from "../card-link";
import { WarningIcon } from "../theme/icons";
import { applyEdits } from "./apply-edits";
import { LazyCardImage } from "./lazy-card-image";
import { useDeckPlan } from "./use-deck-plan";

/** Cuts shown at first; a deck far over 100 has plenty more. */
const FIRST = 8;

/** A warning at the top of a deck's page when it has more than 100 cards, with what to cut. */
export function OverLimitWarning({
  source,
  total,
  commander,
  deckCards,
  profile,
  analysis,
  report,
  combos,
}: {
  source: DeckSource;
  /** The deck's cards, copies counted. */
  total: number;
  commander?: CardDetails;
  deckCards: { card: CardDetails; qty: number }[];
  profile: DeckProfile;
  analysis: DeckAnalysis;
  report: BracketReport;
  combos: DeckCombos | null | undefined;
}) {
  const { loading, plan, identity } = useDeckPlan({ commander, deckCards, profile, analysis, report, combos });
  const [showAll, setShowAll] = useState(false);
  const over = total - DECK_SIZE;
  const cuts = useMemo(
    () => overCuts({ cards: deckCards, over, identity, commander: commander?.name, landTarget: profile.curve.lands.count, slots: plan.curveSlots }),
    [deckCards, over, identity, commander, profile, plan],
  );
  const groups = loading ? [] : groupCuts(cuts);
  const shown = showAll ? groups : groups.slice(0, FIRST);
  const cut = (chosen: BalanceCut[]) => applyEdits(source, deckCards, chosen.map((c) => ({ cut: c })), `Cut ${formatCount(chosen.length)} ${chosen.length === 1 ? "card" : "cards"}`);

  return (
    <section role="alert" aria-label="Too many cards" className="reveal rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <WarningIcon className="mt-0.5 size-6 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="font-semibold text-amber-300">
            This deck has {formatCount(total)} cards: {formatCount(over)} over
          </h2>
          <p className="text-sm text-muted">A Commander deck is {formatCount(DECK_SIZE)} cards, commander included. These are the cuts it would miss least.</p>
        </div>
        {groups.length > 0 && (
          <button type="button" onClick={() => cut(cuts)} className="btn btn-primary btn-sm">
            Cut all {formatCount(cuts.length)}
          </button>
        )}
      </div>
      {groups.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {shown.map((group) => (
            <CutRow key={group.card.name} card={group.card} why={group.why} count={group.count} onCut={() => cut(Array<BalanceCut>(group.count).fill(group))} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="spinner size-4" /> Reading EDHREC’s decks to find the best cuts…
        </p>
      )}
      {groups.length > FIRST && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="link mt-2 text-sm text-muted">
          {showAll ? "Show fewer" : `Show all ${formatCount(groups.length)}`}
        </button>
      )}
    </section>
  );
}

function CutRow({ card, why, count, onCut }: { card: CardDetails; why: string; count: number; onCut: () => void }) {
  const { trigger, preview } = useHoverPreview(card.name);
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2">
      <div {...trigger} tabIndex={0} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg">
        <span className="h-14 w-10 shrink-0 overflow-hidden rounded-[8%] bg-subtle">
          <LazyCardImage url={card.imageUrl} alt="" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium" title={card.name}>
            {card.name}
            {count > 1 && <span className="ml-1 text-muted tabular-nums">×{count}</span>}
          </span>
          <span className="block text-[11px] text-muted">{why}</span>
        </span>
      </div>
      {preview}
      <button type="button" onClick={onCut} aria-label={`Cut ${card.name}`} className="btn btn-secondary btn-sm shrink-0">
        Cut
      </button>
    </li>
  );
}
