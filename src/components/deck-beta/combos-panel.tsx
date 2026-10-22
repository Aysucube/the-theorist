"use client";

import { useMemo } from "react";
import { cardsSeenByTurn, chanceAllSeen, missingPiece, piecesInDeck, simulateConsistency, tutorTarget } from "@/lib/deck-beta/combos";
import { cardKey } from "@/lib/deck-beta/recommend";
import { formatCount, formatPercent } from "@/lib/format";
import type { CardDetails, Combo, DeckCombos } from "@/lib/types";
import { useHoverPreview } from "../card-link";
import { GameChangerTag } from "../game-changer-tag";
import { COMBO_COLORS } from "./deck-network";

/** Turns the consistency chart shows. */
const TURNS = [4, 6, 8, 10];
/** The turn used for each combo's own odds. */
const ODDS_TURN = 8;

export interface DeckForOdds {
  /** Every card but the commander, one entry per copy, by Scryfall name. */
  library: string[];
  commander?: string;
  details: Map<string, CardDetails>;
}

/** The combos panel: how reliably the deck assembles its combos, then every combo, then the ones a card away. */
export function CombosPanel({
  combos,
  deck,
  missing,
  inDeck,
  onAdd,
  onOpen,
  onWalk,
}: {
  combos: DeckCombos;
  deck: DeckForOdds;
  missing: Record<string, CardDetails>;
  inDeck: (name: string) => boolean;
  onAdd: (card: CardDetails) => void;
  onOpen: (name: string) => void;
  /** Zoom the network onto a combo and walk through it. */
  onWalk?: (combo: Combo) => void;
}) {
  const tutors = useMemo(() => {
    const found = new Map<string, string[]>();
    for (const name of new Set(deck.library)) {
      const card = deck.details.get(name);
      const target = card && tutorTarget(card);
      if (target) found.set(name, target);
    }
    return found;
  }, [deck]);

  const odds = useMemo(() => {
    const names = [...deck.details.keys()];
    const pieces = combos.included.map((c) =>
      piecesInDeck(c, names).filter((n): n is string => Boolean(n) && cardKey(n!) !== cardKey(deck.commander ?? "")),
    );
    return simulateConsistency({ library: deck.library, combos: pieces, tutors, details: deck.details, turns: TURNS });
  }, [combos, deck, tutors]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Combos in your deck" value={formatCount(combos.included.length)} />
        <Stat label="One card away" value={formatCount(combos.almostIncluded.length)} />
        <Stat label="Tutors to find pieces" value={formatCount(tutors.size)} title={[...tutors.keys()].join(", ")} />
      </div>

      {combos.included.length > 0 && (
        <section>
          <h3 className="font-semibold">Consistency</h3>
          <p className="mb-3 text-xs text-zinc-500">
            The chance of holding every piece of at least one combo by each turn (on the play, no mulligans), if each
            tutor you draw fetches one missing piece. Worked out by shuffling your deck 4,000 times.
          </p>
          <ul className="flex flex-col gap-1.5">
            {TURNS.map((turn) => (
              <li key={turn} className="grid grid-cols-[5rem_1fr_3.5rem] items-center gap-3 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Turn {turn}</span>
                <span className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(1, odds[turn] * 100)}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums">{formatPercent(odds[turn])}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 font-semibold">Combos in your deck</h3>
        {combos.included.length === 0 ? (
          <p className="text-sm text-zinc-500">Commander Spellbook knows no combo this deck has every piece of.</p>
        ) : (
          <CombosList combos={combos.included} deck={deck} onOpen={onOpen} onWalk={onWalk} />
        )}
      </section>

      {combos.almostIncluded.length > 0 && (
        <section>
          <h3 className="font-semibold">One card away</h3>
          <p className="mb-2 text-xs text-zinc-500">Combos you could add with one more card, most played first.</p>
          <CombosList combos={combos.almostIncluded} deck={deck} missing={missing} inDeck={inDeck} onAdd={onAdd} onOpen={onOpen} onWalk={onWalk} />
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800" title={title}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Combos with their pieces, results, odds and steps; one-card-away ones offer to add the missing card. */
export function CombosList({
  combos,
  deck,
  missing,
  inDeck,
  onAdd,
  onOpen,
  onWalk,
  colorOffset = 0,
}: {
  combos: Combo[];
  deck: DeckForOdds;
  missing?: Record<string, CardDetails>;
  inDeck?: (name: string) => boolean;
  onAdd?: (card: CardDetails) => void;
  onOpen?: (name: string) => void;
  onWalk?: (combo: Combo) => void;
  colorOffset?: number;
}) {
  const names = [...deck.details.keys()];
  const librarySize = deck.library.length;
  return (
    <ul className="flex flex-col gap-2">
      {combos.map((combo, i) => {
        const pieces = piecesInDeck(combo, names);
        const lacking = missingPiece(combo, names);
        const missingCard = lacking ? missing?.[lacking] : undefined;
        const inLibrary = pieces.filter((n) => n && cardKey(n) !== cardKey(deck.commander ?? "")).length;
        const odds = lacking ? undefined : chanceAllSeen(inLibrary, librarySize, cardsSeenByTurn(ODDS_TURN));
        return (
          <li key={combo.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-start gap-2">
              <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: COMBO_COLORS[(i + colorOffset) % COMBO_COLORS.length] }} />
              <p className="min-w-0 flex-1 font-medium">{combo.results.slice(0, 3).join(" · ") || "Combo"}</p>
              {onWalk && (
                <button
                  type="button"
                  onClick={() => onWalk(combo)}
                  className="h-7 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium hover:border-amber-500 dark:border-zinc-700"
                >
                  ▶ Walk through
                </button>
              )}
              {odds !== undefined && (
                <span className="text-xs text-zinc-500 tabular-nums" title={`Chance to draw every piece by turn ${ODDS_TURN}, without tutors`}>
                  {formatPercent(odds)} by turn {ODDS_TURN}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {combo.cards.map((name, pi) => (
                <PieceChip key={name} name={pieces[pi] ?? name} lacking={!pieces[pi]} onOpen={pieces[pi] ? onOpen : undefined} />
              ))}
              {combo.templates.map((t) => (
                <span key={t} className="rounded-md border border-dashed border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700">
                  any {t}
                </span>
              ))}
              {lacking && missingCard && onAdd && inDeck && (
                <button
                  type="button"
                  disabled={inDeck(missingCard.name)}
                  onClick={() => onAdd(missingCard)}
                  className="ml-auto h-7 rounded-lg bg-amber-500 px-2.5 text-xs font-medium text-zinc-950 hover:bg-amber-400 disabled:border disabled:border-emerald-600 disabled:bg-transparent disabled:text-emerald-700 dark:disabled:text-emerald-400"
                >
                  {inDeck(missingCard.name) ? "In deck ✓" : `+ Add ${lacking}`}
                </button>
              )}
            </div>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-xs text-amber-700 dark:text-amber-400">How it works</summary>
              {combo.prerequisites && (
                <p className="mt-2 text-xs whitespace-pre-line text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold">First: </span>
                  {combo.prerequisites}
                </p>
              )}
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5">
                {combo.steps
                  .split("\n")
                  .filter((s) => s.trim())
                  .map((step, si) => (
                    <li key={si}>{step}</li>
                  ))}
              </ol>
              {combo.manaNeeded && <p className="mt-2 text-xs text-zinc-500">Mana needed: {combo.manaNeeded}</p>}
              <a href={combo.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-amber-700 hover:underline dark:text-amber-400">
                View on Commander Spellbook ↗
              </a>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function PieceChip({ name, lacking, onOpen }: { name: string; lacking: boolean; onOpen?: (name: string) => void }) {
  const { trigger, preview } = useHoverPreview(name);
  const className = `inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${
    lacking
      ? "border-dashed border-amber-500 text-amber-800 dark:text-amber-300"
      : "border-zinc-200 bg-white hover:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
  }`;
  return (
    <>
      {onOpen ? (
        <button
          type="button"
          {...trigger}
          onClick={() => {
            trigger.onClick();
            onOpen(name);
          }}
          className={className}
        >
          {name}
          <GameChangerTag name={name} compact className="ml-1" />
        </button>
      ) : (
        <span {...trigger} className={className}>
          {name}
          <GameChangerTag name={name} compact className="ml-1" />
          {lacking && <span className="ml-1 text-[10px] uppercase">missing</span>}
        </span>
      )}
      {preview}
    </>
  );
}
