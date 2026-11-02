"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCardPrintings } from "@/lib/deck-beta/store";
import { formatCount, formatPhp } from "@/lib/format";
import { PRINTING_VARIANTS, type PricedPrinting } from "@/lib/printings";
import type { CardDetails, ChosenPrinting } from "@/lib/types";

/** Printings shown at first; basic lands have hundreds. */
const FIRST = 48;
const IN_STOCK = "In PH stores";

/**
 * Picks the printing of a card for a deck: every set it's been in, narrowed to
 * an art treatment (Showcase, Borderless, Retro Frame), a promo, or what PH
 * stores have. The chosen one is what the deck shows.
 */
export function PrintingPicker({
  card,
  chosen,
  onChoose,
  onClose,
}: {
  card: CardDetails;
  chosen?: ChosenPrinting;
  onChoose: (printing: ChosenPrinting | undefined) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const state = useCardPrintings(card.name);
  const [filter, setFilter] = useState("All");
  const [shown, setShown] = useState(FIRST);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const printings = useMemo(() => (state?.state === "done" && state.result.found ? state.result.printings : []), [state]);
  const filters = useMemo(() => {
    const count = (fits: (p: PricedPrinting) => boolean) => printings.filter(fits).length;
    return [
      { label: "All", count: printings.length },
      { label: IN_STOCK, count: count((p) => Boolean(p.cheapest)) },
      ...PRINTING_VARIANTS.map((label) => ({ label, count: count((p) => Boolean(p.variants?.includes(label))) })),
    ].filter((f) => f.count > 0);
  }, [printings]);
  const matches = printings.filter((p) => filter === "All" || (filter === IN_STOCK ? Boolean(p.cheapest) : p.variants?.includes(filter)));
  const choose = (printing: ChosenPrinting | undefined) => {
    onChoose(printing);
    dialog.current?.close();
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-label={`Printings of ${card.name}`}
      className="m-auto max-h-[90vh] w-[min(960px,96vw)] max-w-none overflow-hidden rounded-2xl border border-line-strong bg-surface p-0 text-foreground backdrop:bg-black/70"
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex flex-col gap-3 border-b border-line p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">{card.name}</h2>
              <p className="text-sm text-muted">{printings.length > 0 ? `${formatCount(printings.length)} printings. Pick the one in your deck.` : "Pick the printing in your deck."}</p>
            </div>
            {chosen && (
              <button type="button" onClick={() => choose(undefined)} className="btn btn-ghost btn-sm text-muted">
                Use default art
              </button>
            )}
            <button type="button" onClick={() => dialog.current?.close()} className="btn btn-secondary btn-sm">
              Close
            </button>
          </div>
          {filters.length > 2 && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter printings">
              {filters.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  aria-pressed={filter === f.label}
                  onClick={() => {
                    setFilter(f.label);
                    setShown(FIRST);
                  }}
                  className="pill shrink-0"
                >
                  {f.label}
                  <span className="text-[11px] tabular-nums opacity-60">{formatCount(f.count)}</span>
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="overflow-y-auto p-4">
          {state?.state === "error" || (state?.state === "done" && !state.result.found) ? (
            <p className="text-sm text-muted">Couldn’t load this card’s printings right now.</p>
          ) : state?.state !== "done" ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted">
              <span aria-hidden className="spinner size-4" />
              {state?.state === "waiting" ? `Waiting ${state.seconds}s because ${state.reason}…` : "Finding every printing…"}
            </p>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">
                {matches.slice(0, shown).map((p) => (
                  <li key={p.key}>
                    <PrintingTile printing={p} selected={chosen?.setCode === p.setCode && chosen.collectorNumber === p.collectorNumber} onChoose={choose} />
                  </li>
                ))}
              </ul>
              {matches.length > shown && (
                <button type="button" onClick={() => setShown(shown + FIRST)} className="btn btn-secondary btn-sm mt-4">
                  Show more ({formatCount(matches.length - shown)} left)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

function PrintingTile({ printing: p, selected, onChoose }: { printing: PricedPrinting; selected: boolean; onChoose: (printing: ChosenPrinting) => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onChoose({ setCode: p.setCode, setName: p.setName, collectorNumber: p.collectorNumber, imageUrl: p.largeImageUrl ?? p.imageUrl })}
      aria-label={`Choose the ${p.setName} printing, number ${p.collectorNumber}`}
      className="group block w-full text-left"
    >
      <span className={`block aspect-[146/204] overflow-hidden rounded-[4.75%] bg-subtle ${selected ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}>
        {p.imageUrl && (
          // Plain <img>: Scryfall's image server sizes these already.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" width={146} height={204} loading="lazy" className="h-full w-full object-cover transition-opacity group-hover:opacity-85" />
        )}
      </span>
      <span className="mt-1.5 block truncate text-xs font-medium" title={p.setName}>
        {p.setName}
      </span>
      <span className="block truncate text-[11px] text-muted">
        {p.setCode} #{p.collectorNumber}
        {p.releasedAt && ` · ${p.releasedAt.slice(0, 4)}`}
      </span>
      {(p.variants?.length ?? 0) > 0 && <span className="block truncate text-[11px] text-accent">{p.variants!.join(" · ")}</span>}
      <span className="block truncate text-[11px] tabular-nums">
        {p.cheapest ? (
          <>
            <span className="font-semibold text-emerald-400">{formatPhp(p.cheapest.pricePhp)}</span> <span className="text-muted">{p.cheapest.store}</span>
          </>
        ) : (
          <span className="text-muted">Not in PH stores</span>
        )}
      </span>
    </button>
  );
}
