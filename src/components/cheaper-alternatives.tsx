"use client";

import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useBinder } from "@/lib/binder/store";
import { hasCard } from "@/lib/deck";
import { retryAlternatives, useAlternatives } from "@/lib/deck-beta/store";
import { formatPhp } from "@/lib/format";
import { ALTERNATIVES_FROM_PHP } from "@/lib/shopping";
import type { AlternativeCard } from "@/lib/types";
import { useDeck, useSavedPrices } from "@/lib/use-deck";
import { CardLink } from "./card-link";
import { ManaCost } from "./mana";
import { PriceLabel } from "./price-check";
import { ArrowDownIcon } from "./theme/icons";

/**
 * A drop arrow for a card on the Shopping page, and the menu of cheaper cards
 * with similar effects it opens. Place `arrow` next to the card and `menu`
 * under it; both are null for a card that costs less than ₱100. `pricePhp` is
 * the price shown beside the card, which the alternatives are measured against.
 * The menu's cards are only looked up when it's opened.
 */
export function useCheaperAlternatives(name: string, pricePhp: number | undefined): { arrow: ReactNode; menu: ReactNode } {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (pricePhp === undefined || pricePhp < ALTERNATIVES_FROM_PHP) return { arrow: null, menu: null };
  return {
    arrow: (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Cheaper alternatives to ${name}`}
        title="Cheaper alternatives"
        onClick={() => setOpen(!open)}
        className="-my-1 flex size-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-foreground"
      >
        <ArrowDownIcon className={`size-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
    ),
    menu: open ? <AlternativesMenu id={id} name={name} beat={pricePhp} /> : null,
  };
}

function AlternativesMenu({ id, name, beat }: { id: string; name: string; beat: number }) {
  const state = useAlternatives(name);
  const result = state?.state === "done" ? state.result : undefined;
  const cheaper = result?.alternatives.filter((a) => a.price.cheapest!.pricePhp < beat) ?? [];

  return (
    <div id={id} className="reveal-fast mt-2 rounded-lg border border-line bg-subtle/50 p-3 text-sm">
      <p className="eyebrow">Cheaper alternatives</p>
      {state?.state === "error" ? (
        <p className="mt-1 text-muted">
          Couldn’t look these up right now. <TryAgain name={name} />
        </p>
      ) : !result ? (
        <p role="status" className="mt-1 flex items-center gap-2 text-muted">
          <span aria-hidden className="spinner size-4" />
          {state?.state === "waiting" ? `Waiting ${state.seconds}s because ${state.reason}…` : "Finding cards with similar effects…"}
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted">
            {cheaper.length > 0 ? "Similar effects in the same colors, cheapest first." : "No cheaper cards with a similar effect are in stock right now."}
          </p>
          {cheaper.length > 0 && (
            <ul className="mt-2">
              {cheaper.map((alternative) => (
                <AlternativeRow key={alternative.name} alternative={alternative} instead={name} savesPhp={beat - alternative.price.cheapest!.pricePhp} />
              ))}
            </ul>
          )}
          {result.incomplete && (
            <p className="mt-2 text-xs text-muted">
              Some cards couldn’t be checked. <TryAgain name={name} />
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TryAgain({ name }: { name: string }) {
  return (
    <button type="button" onClick={() => retryAlternatives(name)} className="underline hover:text-foreground">
      Try again
    </button>
  );
}

function AlternativeRow({ alternative, instead, savesPhp }: { alternative: AlternativeCard; instead: string; savesPhp: number }) {
  const { deck, swap } = useDeck();
  const { record } = useSavedPrices();
  const binder = useBinder();
  const { name, typeLine, manaCost, price } = alternative;
  const owned = binder.owned(name);

  function swapIn() {
    swap(instead, name);
    record(name, price);
    toast(`Swapped ${instead} for ${name}`, { action: { label: "Undo", onClick: () => swap(name, instead) } });
  }

  return (
    <li className="flex items-center gap-3 border-b border-line py-2 last:border-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <CardLink name={name} className="hover:underline" />
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
          {manaCost && <ManaCost cost={manaCost} />}
          <span className="min-w-0 truncate">
            {owned > 0 && <span className="text-foreground/70">In your binder · </span>}
            {typeLine}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right text-xs">
        <PriceLabel result={price} />
        <div className="text-muted tabular-nums">{formatPhp(Math.round(savesPhp))} less</div>
      </div>
      {hasCard(deck, name) ? (
        <span className="w-14 shrink-0 text-center text-xs text-muted">On list</span>
      ) : (
        <button type="button" onClick={swapIn} aria-label={`Swap ${instead} for ${name}`} className="btn btn-secondary btn-sm w-14 shrink-0">
          Swap
        </button>
      )}
    </li>
  );
}
