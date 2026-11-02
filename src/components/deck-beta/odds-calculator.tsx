"use client";

import { useId, useState } from "react";
import { cardsSeenByTurn } from "@/lib/deck-beta/combos";
import { chanceAtLeast, hitSpread } from "@/lib/deck-beta/hypergeometric";
import { isLandCard } from "@/lib/deck-beta/lands";
import { CATEGORIES, CATEGORY_INFO, type DeckProfile } from "@/lib/deck-beta/roles";
import { formatCount, formatPercent } from "@/lib/format";
import type { CardDetails } from "@/lib/types";

/** Turns shown in the turn-by-turn table. */
const TURNS = [1, 2, 3, 4, 5, 6, 8, 10];
const LANDS = "Lands";

/**
 * The odds of drawing what the deck needs: pick groups of cards or specific
 * cards, how many of them, and by which turn, on the play or on the draw. It's
 * a hypergeometric calculation over the library (the deck without its commander).
 */
export function OddsCalculator({ deckCards, profile, commander }: { deckCards: { card: CardDetails; qty: number }[]; profile: DeckProfile; commander?: string }) {
  const listId = useId();
  const [groups, setGroups] = useState<string[]>([LANDS]);
  const [named, setNamed] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [want, setWant] = useState(3);
  const [turn, setTurn] = useState(1);
  const [onDraw, setOnDraw] = useState(false);

  const library = deckCards.filter(({ card }) => card.name !== commander);
  const librarySize = library.reduce((sum, { qty }) => sum + qty, 0);
  const copies = new Map(library.map(({ card, qty }) => [card.name, qty]));
  const namesIn = (group: string) => (group === LANDS ? library.filter(({ card }) => isLandCard(card)).map(({ card }) => card.name) : (profile.categories[group as keyof typeof profile.categories] ?? []));
  const options = [LANDS, ...CATEGORIES];
  const label = (group: string) => (group === LANDS ? LANDS : CATEGORY_INFO[group as keyof typeof CATEGORY_INFO].label);
  const countIn = (names: string[]) => names.reduce((sum, name) => sum + (copies.get(name) ?? 0), 0);

  const wanted = new Set([...groups.flatMap(namesIn), ...named]);
  const hits = countIn([...wanted]);
  const seenBy = (t: number) => cardsSeenByTurn(t) + (onDraw ? 1 : 0);
  const seen = seenBy(turn);
  const chance = chanceAtLeast(librarySize, hits, seen, want);
  const spread = hitSpread(librarySize, hits, seen).slice(0, 9);
  const top = Math.max(...spread, 0.01);
  const landCount = countIn(namesIn(LANDS));
  const openers = hitSpread(librarySize, landCount, 7);
  const keepable = openers.slice(2, 6).reduce((a, b) => a + b, 0);
  const addCard = (name: string) => {
    if (copies.has(name) && !named.includes(name)) setNamed([...named, name]);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium">Look for</p>
            <div role="group" aria-label="Groups of cards" className="mt-2 flex flex-wrap gap-1.5">
              {options.map((group) => (
                <button key={group} type="button" aria-pressed={groups.includes(group)} onClick={() => setGroups(groups.includes(group) ? groups.filter((g) => g !== group) : [...groups, group])} className="pill">
                  {label(group)}
                  <span className="text-[11px] tabular-nums opacity-60">{formatCount(countIn(namesIn(group)))}</span>
                </button>
              ))}
            </div>
            <input
              type="search"
              list={listId}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (copies.has(e.target.value)) addCard(e.target.value);
              }}
              placeholder="Add a specific card"
              aria-label="Add a specific card"
              className="field mt-3 h-9 max-w-sm"
            />
            <datalist id={listId}>
              {library.map(({ card }) => (
                <option key={card.name} value={card.name} />
              ))}
            </datalist>
            {named.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {named.map((name) => (
                  <li key={name}>
                    <button type="button" onClick={() => setNamed(named.filter((n) => n !== name))} aria-label={`Stop looking for ${name}`} className="pill" aria-pressed>
                      {name} ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium">
              At least
              <input type="number" min={0} max={20} value={want} onChange={(e) => setWant(Math.max(0, Number(e.target.value) || 0))} className="field mt-1 h-9 w-full" />
            </label>
            <label className="text-sm font-medium">
              By turn
              <select value={turn} onChange={(e) => setTurn(Number(e.target.value))} className="field mt-1 h-9 w-full">
                <option value={1}>Opening hand</option>
                {Array.from({ length: 11 }, (_, i) => i + 2).map((t) => (
                  <option key={t} value={t}>
                    Turn {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={onDraw} onChange={(e) => setOnDraw(e.target.checked)} className="size-4 accent-accent" />
              On the draw
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{formatPercent(chance)}</p>
          <p className="mt-1 text-sm text-muted">
            To see at least {formatCount(want)} of your {formatCount(hits)} {hits === 1 ? "card" : "cards"} in {formatCount(seen)} cards of a {formatCount(librarySize)}-card library.
          </p>
          <ul className="mt-4 flex flex-col gap-1">
            {spread.map((share, count) => (
              <li key={count} className="grid grid-cols-[3.5rem_1fr_3rem] items-center gap-2 text-xs">
                <span className="text-muted tabular-nums">Exactly {count}</span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-subtle">
                  <span className={`block h-full origin-left rounded-full ${count >= want ? "bg-accent" : "bg-line-strong"}`} style={{ transform: `scaleX(${share / top})` }} />
                </span>
                <span className="text-right tabular-nums">{formatPercent(share)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">Turn by turn</p>
        <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {TURNS.map((t) => (
            <li key={t} className="rounded-lg bg-subtle px-2 py-1.5 text-center">
              <span className="block text-[11px] text-muted">{t === 1 ? "Opener" : `Turn ${t}`}</span>
              <span className="text-sm font-semibold tabular-nums">{formatPercent(chanceAtLeast(librarySize, hits, seenBy(t), want))}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-sm font-medium">Lands in your opening hand</p>
        <p className="text-xs text-muted">
          With {formatCount(landCount)} lands, {formatPercent(keepable)} of opening hands hold 2 to 5 lands.
        </p>
        <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {openers.map((share, count) => (
            <li key={count} className={`rounded-lg px-2 py-1.5 text-center ${count >= 2 && count <= 5 ? "bg-accent/15" : "bg-subtle"}`}>
              <span className="block text-[11px] text-muted">{count} lands</span>
              <span className="text-sm font-semibold tabular-nums">{formatPercent(share)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
