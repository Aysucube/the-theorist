"use client";

import { AppLink as Link } from "@/components/app-link";
import { useId, useMemo, useState } from "react";
import { missingFromBinder, ownedCounts } from "@/lib/binder/collection";
import { useBinder } from "@/lib/binder/store";
import { hasCard, importCards, MAX_DECK_CARDS, type DeckCard } from "@/lib/deck";
import { formatCount } from "@/lib/format";
import type { CardDetails } from "@/lib/types";
import { useDeck } from "@/lib/use-deck";

const plural = (n: number) => `${formatCount(n)} ${n === 1 ? "card" : "cards"}`;

/**
 * Puts the cards this deck needs that aren't in the binder into the Shopping
 * list, where their prices are checked across Philippine stores. Copies you
 * own are taken off (own 1 of a card the deck runs 2 of, and 1 goes on the
 * list). Basic lands are left out unless asked for, since most players have
 * plenty. Cards already on the list take the number still needed.
 */
export function AddToShopping({ deck, detailsFor }: { deck: DeckCard[]; detailsFor: (name: string) => CardDetails | null | undefined }) {
  const shopping = useDeck();
  const binder = useBinder();
  const [open, setOpen] = useState(false);
  const [skipBasics, setSkipBasics] = useState(true);
  const [result, setResult] = useState<{ added: number; left: number } | null>(null);
  const panelId = useId();

  const counts = useMemo(() => ownedCounts(binder.cards), [binder.cards]);
  const isBasic = (name: string) => /\bBasic\b/.test(detailsFor(name)?.typeLine ?? "");
  const wanted = deck.filter((c) => !(skipBasics && isBasic(c.name)));
  // Basics were dealt with by the checkbox above, so the binder check counts every card.
  const missing = missingFromBinder(wanted, counts, true);
  const copiesOf = (list: DeckCard[]) => list.reduce((sum, c) => sum + c.qty, 0);
  const needed = copiesOf(missing);
  const owned = copiesOf(wanted) - needed;

  function add() {
    const next = importCards(shopping.deck, missing);
    const fitted = missing.filter((c) => hasCard(next, c.name));
    shopping.importCards(missing);
    setResult({ added: copiesOf(fitted), left: missing.length - fitted.length });
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
        className="btn btn-secondary h-9 px-3"
      >
        Add to Shopping
      </button>
      {open && (
        <div
          id={panelId}
          className={`pop-in absolute top-full right-0 z-30 mt-2 flex w-72 flex-col gap-3 rounded-xl border border-line-strong bg-surface shadow-[0_24px_60px_-16px_rgb(0_0_0/0.75),0_0_40px_-16px_rgb(90_176_255/0.3)] p-4 text-sm [--transform-origin:right_top]`}
        >
          {result ? (
            <>
              <p role="status">
                Added {plural(result.added)} you don’t own to your Shopping list.
                {result.left > 0 &&
                  ` ${formatCount(result.left)} didn’t fit: the list holds ${MAX_DECK_CARDS} different cards.`}
              </p>
              <Link href="/shopping" className="font-medium link">
                Open Shopping →
              </Link>
            </>
          ) : (
            <>
              {binder.cards.length === 0 ? (
                <p>
                  Your binder is empty, so every card in this deck ({plural(needed)}) would go on the list.{" "}
                  <Link href="/binder" className="link">
                    Add your collection
                  </Link>{" "}
                  to leave out the cards you own.
                </p>
              ) : needed === 0 ? (
                <p>You own every card in this deck{skipBasics ? " (basic lands aside)" : ""}. There’s nothing to buy.</p>
              ) : (
                <p>
                  Puts the {plural(needed)} you don’t own into your Shopping list to price in Philippine stores.
                  {owned > 0 && ` ${plural(owned)} ${owned === 1 ? "is" : "are"} already in your binder and left out.`}
                </p>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={skipBasics} onChange={(e) => setSkipBasics(e.target.checked)} className="size-4 accent-accent" />
                Leave out basic lands
              </label>
              <button type="button" onClick={add} disabled={needed === 0} data-cast className="btn btn-primary h-9 px-3 disabled:opacity-50">
                {needed === 0 ? "Nothing to add" : `Add ${plural(needed)}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
