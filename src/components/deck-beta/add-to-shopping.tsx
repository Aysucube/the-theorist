"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { hasCard, importCards, MAX_DECK_CARDS, type DeckCard } from "@/lib/deck";
import { formatCount } from "@/lib/format";
import type { CardDetails } from "@/lib/types";
import { useDeck } from "@/lib/use-deck";

/**
 * Copies this deck, as it is now, into the Shopping list, where its prices
 * are checked across Philippine stores. Basic lands are left out unless asked
 * for, since most players have plenty. Cards already on the list take this
 * deck's quantity.
 */
export function AddToShopping({ deck, detailsFor }: { deck: DeckCard[]; detailsFor: (name: string) => CardDetails | null | undefined }) {
  const shopping = useDeck();
  const [open, setOpen] = useState(false);
  const [skipBasics, setSkipBasics] = useState(true);
  const [result, setResult] = useState<{ added: number; left: number } | null>(null);
  const panelId = useId();

  const isBasic = (name: string) => /\bBasic\b/.test(detailsFor(name)?.typeLine ?? "");
  const cards = deck.filter((c) => !(skipBasics && isBasic(c.name)));
  const copies = cards.reduce((sum, c) => sum + c.qty, 0);

  function add() {
    const next = importCards(shopping.deck, cards);
    const fitted = cards.filter((c) => hasCard(next, c.name));
    shopping.importCards(cards);
    setResult({ added: fitted.reduce((sum, c) => sum + c.qty, 0), left: cards.length - fitted.length });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!open);
          setResult(null);
        }}
        className="h-9 rounded-lg border border-amber-500 px-3 text-sm font-medium text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
      >
        Add to Shopping
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-30 mt-2 flex w-72 flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          {result ? (
            <>
              <p role="status">
                Added {formatCount(result.added)} {result.added === 1 ? "card" : "cards"} to your Shopping list.
                {result.left > 0 &&
                  ` ${formatCount(result.left)} didn’t fit: the list holds ${MAX_DECK_CARDS} different cards.`}
              </p>
              <Link href="/shopping" className="font-medium text-amber-700 hover:underline dark:text-amber-400">
                Open Shopping →
              </Link>
            </>
          ) : (
            <>
              <p>
                Copies this deck as it is now ({formatCount(copies)} {copies === 1 ? "card" : "cards"}) into your Shopping list to
                price it in Philippine stores. Cards already there take this deck’s quantity.
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={skipBasics} onChange={(e) => setSkipBasics(e.target.checked)} className="size-4 accent-amber-500" />
                Leave out basic lands
              </label>
              <button type="button" onClick={add} disabled={cards.length === 0} className="h-9 rounded-lg bg-amber-500 px-3 font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50">
                Add {formatCount(copies)} {copies === 1 ? "card" : "cards"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
