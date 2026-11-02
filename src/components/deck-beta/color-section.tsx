"use client";

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useCardDetails } from "@/lib/binder/card-cache";
import { isBasicLandName } from "@/lib/binder/collection";
import { useBinder } from "@/lib/binder/store";
import { afterSwaps, BASIC_OF, balanceColors, colorGap, groupSwaps, isBalanced, type BalanceCut, type ColorBalance, type ColorSwap, type SwapGroup } from "@/lib/deck-beta/color-balance";
import { colorDistribution, isLandCard, type ColorDistribution } from "@/lib/deck-beta/lands";
import { cardKey } from "@/lib/deck-beta/recommend";
import { useFixingLands, type DeckSource } from "@/lib/deck-beta/store";
import { formatCount, formatPercent } from "@/lib/format";
import type { CardDetails } from "@/lib/types";
import { useHoverPreview } from "../card-link";
import { Pip } from "../mana";
import { LazyCardImage } from "./lazy-card-image";

type DeckLine = { card: CardDetails; qty: number };

/**
 * What the deck's spells ask of each color against what its lands make, and a
 * quick add that brings the two together: it proposes lands to bring in and
 * cards to cut for them, and nothing changes until you've looked them over.
 */
export function ColorSection({
  id,
  className,
  source,
  commander,
  deckCards,
  identity,
  lands,
  landTarget,
  spellCuts,
}: {
  id: string;
  className: string;
  source: DeckSource;
  commander?: string;
  deckCards: DeckLine[];
  identity: string[];
  /** The lands EDHREC's decks play for this commander, the best first. */
  lands: CardDetails[];
  landTarget: number;
  /** Spells that could make way for a land, the first to cut at the front. */
  spellCuts: BalanceCut[];
}) {
  const binder = useBinder();
  const [reviewing, setReviewing] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const fixing = useFixingLands(identity);
  const basicNames = identity.flatMap((color) => BASIC_OF[color] ?? []);
  const { detailsFor } = useCardDetails(reviewing ? basicNames : []);
  const colors = useMemo(() => colorDistribution(deckCards, identity), [deckCards, identity]);
  const basics = basicNames.flatMap((name) => detailsFor(name) ?? []);

  const pool = [...lands, ...(fixing ?? [])].filter((land) => !ownedOnly || binder.owned(land.name) > 0);
  const balance = reviewing && basics.length === basicNames.length ? balanceColors({ cards: deckCards, identity, lands: pool, basics, owned: binder.owned, commander, landTarget, spellCuts }) : undefined;

  const apply = (chosen: ColorSwap[]) => {
    const before = source.deck;
    const loaded = new Set(deckCards.map((line) => cardKey(line.card.name)));
    const others = before.filter((c) => !loaded.has(cardKey(c.name)));
    // Adding them keeps their details, so they show up at once.
    chosen.forEach((swap) => source.add(swap.add));
    source.replace([...others, ...afterSwaps(deckCards, chosen).map(({ card, qty }) => ({ name: card.name, qty }))]);
    setReviewing(false);
    toast.success(`Made ${formatCount(chosen.length)} ${chosen.length === 1 ? "edit" : "edits"}`, { action: { label: "Undo", onClick: () => source.replace(before) } });
  };

  return (
    <section id={id} className={className}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 className="font-semibold">Color distribution</h3>
          <p className="text-xs text-muted">The colored mana your spells ask for, against what your lands can make. Duals count for each of their colors.</p>
        </div>
        {colors.colors.length >= 2 &&
          !reviewing &&
          (isBalanced(colors) ? (
            <p className="text-xs text-emerald-400">Balanced: your lands match your spells.</p>
          ) : (
            <button type="button" onClick={() => setReviewing(true)} className="btn btn-primary btn-sm">
              Quick add: balance colors
            </button>
          ))}
        {reviewing && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} className="size-3.5 accent-accent" />
            Only lands in my binder
          </label>
        )}
      </div>
      {!reviewing ? (
        <ColorChart colors={colors} />
      ) : balance ? (
        <BalanceReview
          key={balance.swaps.map((s) => `${s.add.name}>${s.cut?.card.name}`).join()}
          balance={balance}
          colors={colors}
          deckCards={deckCards}
          identity={identity}
          owned={binder.owned}
          ownedOnly={ownedOnly}
          onApply={apply}
          onCancel={() => setReviewing(false)}
        />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="spinner size-4" /> Finding lands for your colors…
        </p>
      )}
    </section>
  );
}

/** The proposed edits, each one yours to keep, change or leave out, with what they'd do to the colors. */
function BalanceReview({
  balance,
  colors,
  deckCards,
  identity,
  owned,
  ownedOnly,
  onApply,
  onCancel,
}: {
  balance: ColorBalance;
  colors: ColorDistribution;
  deckCards: DeckLine[];
  identity: string[];
  owned: (name: string) => number;
  ownedOnly: boolean;
  onApply: (chosen: ColorSwap[]) => void;
  onCancel: () => void;
}) {
  const [skipped, setSkipped] = useState<number[]>([]);
  const [cutFor, setCutFor] = useState<Record<number, BalanceCut>>({});
  const groups = groupSwaps(balance.swaps).map((group, i) => ({ ...group, cut: cutFor[i] ?? group.cut }));
  const kept = groups.filter((_, i) => !skipped.includes(i));
  const chosen = kept.flatMap((group) => Array<ColorSwap>(group.count).fill(group));
  const result = afterSwaps(deckCards, chosen);
  const after = colorDistribution(result, identity);
  const cardCount = result.reduce((sum, { qty }) => sum + qty, 0);
  const landCount = result.reduce((sum, { card, qty }) => sum + (isLandCard(card) ? qty : 0), 0);
  const copies = (name: string) => deckCards.find((line) => line.card.name === name)?.qty ?? 0;
  // A cut needs a copy for every swap in its line, after the other lines take theirs.
  const cutsFor = (index: number) =>
    balance.cuts.filter((option) => {
      const taken = kept.filter((g) => g !== groups[index] && g.cut?.card.name === option.card.name).reduce((sum, g) => sum + g.count, 0);
      return copies(option.card.name) - taken >= groups[index].count;
    });

  return (
    <div className="reveal-fast flex flex-col gap-5">
      <ColorChart colors={colors} after={after} />
      <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4">
        <h4 className="text-sm font-semibold">Proposed edits</h4>
        {groups.length === 0 ? (
          <p className="text-sm text-muted">No swap gets any closer: your lands are as near as whole cards allow{ownedOnly ? " with what’s in your binder" : ""}.</p>
        ) : (
          <>
            <p className="text-xs text-muted">
              Your lands are {formatPercent(colorGap(colors))} off what your spells ask for, and would be {formatPercent(colorGap(after))} off after these. Whole lands can’t hit a percentage exactly, so expect a point or two either way.
            </p>
            <ul className="flex flex-col gap-2">
              {groups.map((group, i) => (
                <SwapRow
                  key={`${group.add.name}|${i}`}
                  group={group}
                  on={!skipped.includes(i)}
                  cuts={cutsFor(i)}
                  owned={owned}
                  onToggle={() => setSkipped(skipped.includes(i) ? skipped.filter((n) => n !== i) : [...skipped, i])}
                  onCut={(cut) => setCutFor({ ...cutFor, [i]: cut })}
                />
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {groups.length > 0 && (
            <button type="button" disabled={chosen.length === 0} onClick={() => onApply(chosen)} className="btn btn-primary btn-sm">
              Apply {formatCount(chosen.length)} {chosen.length === 1 ? "edit" : "edits"}
            </button>
          )}
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
            Cancel
          </button>
          {groups.length > 0 && (
            <span className="text-xs text-muted tabular-nums">
              Deck after: {formatCount(cardCount)} cards, {formatCount(landCount)} lands
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SwapRow({ group, on, cuts, owned, onToggle, onCut }: { group: SwapGroup; on: boolean; cuts: BalanceCut[]; owned: (name: string) => number; onToggle: () => void; onCut: (cut: BalanceCut) => void }) {
  const { add, cut, count, makes, label } = group;
  const spare = owned(add.name) > 0 ? "In your binder" : "Not owned";
  const lands = cuts.filter((c) => isLandCard(c.card));
  const spells = cuts.filter((c) => !isLandCard(c.card));
  return (
    <li className={`flex items-start gap-3 rounded-xl border border-line bg-surface p-3 transition-opacity duration-150 ${on ? "" : "opacity-55"}`}>
      <input type="checkbox" checked={on} onChange={onToggle} aria-label={`Bring in ${add.name}${cut ? ` for ${cut.card.name}` : ""}`} className="mt-1 size-4 shrink-0 accent-accent" />
      <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        {cut ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <SwapCard action="Cut" card={cut.card} count={count} note={cut.why} />
            <label className="flex min-w-0 items-center gap-2 text-[11px] text-muted">
              Cut instead
              <select
                value={cut.card.name}
                onChange={(e) => {
                  const next = cuts.find((c) => c.card.name === e.target.value);
                  if (next) onCut(next);
                }}
                className="field h-7 min-w-0 flex-1 py-0 text-xs"
              >
                {!cuts.some((c) => c.card.name === cut.card.name) && <option value={cut.card.name}>{cut.card.name}</option>}
                <optgroup label="Lands">
                  {lands.map((c) => (
                    <option key={c.card.name} value={c.card.name}>
                      {c.card.name}
                    </option>
                  ))}
                </optgroup>
                {spells.length > 0 && (
                  <optgroup label="Spells">
                    {spells.map((c) => (
                      <option key={c.card.name} value={c.card.name}>
                        {c.card.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          </div>
        ) : (
          <p className="text-xs text-muted">Nothing to cut: the deck has room.</p>
        )}
        <span aria-hidden className="hidden text-muted md:block">
          →
        </span>
        <SwapCard
          action="Add"
          card={add}
          count={count}
          note={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="inline-flex items-center gap-0.5">
                {makes.map((color) => (
                  <Pip key={color} symbol={color} />
                ))}
              </span>
              {isBasicLandName(add.name) ? "Basic land" : `${label} · ${spare}`}
            </span>
          }
        />
      </div>
    </li>
  );
}

function SwapCard({ action, card, count, note }: { action: string; card: CardDetails; count: number; note: ReactNode }) {
  const { trigger, preview } = useHoverPreview(card.name);
  return (
    <>
      <div {...trigger} tabIndex={0} className="flex min-w-0 items-center gap-2.5 rounded-lg">
        <span className="h-14 w-10 shrink-0 overflow-hidden rounded-[8%] bg-subtle">
          <LazyCardImage url={card.imageUrl} alt="" />
        </span>
        <span className="min-w-0">
          <span className="eyebrow block">{action}</span>
          <span className="block truncate text-sm font-medium" title={card.name}>
            {card.name}
            {count > 1 && <span className="ml-1 text-muted tabular-nums">×{count}</span>}
          </span>
          <span className="block text-[11px] text-muted">{note}</span>
        </span>
      </div>
      {preview}
    </>
  );
}

/** Each color's share of the deck's mana symbols beside its share of the lands' sources, and of the lands after any edits. */
function ColorChart({ colors, after }: { colors: ColorDistribution; after?: ColorDistribution }) {
  if (colors.colors.length === 0) return <p className="text-sm text-muted">This deck has no colors to balance.</p>;
  return (
    <div className="flex flex-col gap-4">
      {colors.colors.map((c, i) => (
        <div key={c.color} className="grid grid-cols-[1.5rem_1fr] items-start gap-2">
          <Pip symbol={c.color} className="mt-0.5" />
          <div className="flex flex-col gap-1">
            <ColorBar label="Spells ask for" share={c.pipShare} detail={`${formatPercent(c.pipShare)} · ${formatCount(Math.round(c.pips))} symbols`} tone="bg-accent" />
            <ColorBar label="Lands make" share={c.sourceShare} detail={`${formatPercent(c.sourceShare)} · ${formatCount(c.sources)} lands`} tone="bg-foreground/50" />
            {after && <ColorBar label="After edits" share={after.colors[i].sourceShare} detail={`${formatPercent(after.colors[i].sourceShare)} · ${formatCount(after.colors[i].sources)} lands`} tone="bg-emerald-400" />}
            {!after && c.short >= 2 && <p className="text-xs text-amber-400">About {formatCount(c.short)} sources short for how much your spells ask of it.</p>}
          </div>
        </div>
      ))}
      {colors.colorless > 0 && (
        <p className="text-xs text-muted">
          {formatCount(colors.colorless)} of your {formatCount(colors.lands)} lands {colors.colorless === 1 ? "makes" : "make"} none of your colors.
        </p>
      )}
    </div>
  );
}

function ColorBar({ label, share, detail, tone }: { label: string; share: number; detail: string; tone: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-subtle">
        <span className={`block h-full origin-left rounded-full transition-transform duration-300 ease-out ${tone}`} style={{ transform: `scaleX(${share})` }} />
      </span>
      <span className="text-right text-muted tabular-nums">{detail}</span>
    </div>
  );
}
