"use client";

import { formatCount, formatPhp } from "@/lib/format";
import { checkPrices, usePriceQueue } from "@/lib/price-queue";
import type { PriceResponse } from "@/lib/types";

/**
 * A "Check ₱" button that looks up a card's cheapest Philippine price only
 * when asked, so a list of recommendations doesn't fire dozens of TCGph
 * requests. Goes through the shared price queue, so "Load All Prices" and
 * this button fill in the same row.
 */
export function PriceCheck({ name }: { name: string }) {
  const state = usePriceQueue()(name);

  if (state.status === "done" && state.result !== "error") {
    return (
      // Announces the price to screen readers when it arrives.
      <span aria-live="polite" className="inline-flex justify-end">
        <PriceLabel result={state.result} />
      </span>
    );
  }

  const busy = state.status === "queued" || state.status === "loading" || state.status === "waiting";
  const label =
    state.status === "queued"
      ? "Queued…"
      : state.status === "loading"
        ? "Checking…"
        : state.status === "waiting"
          ? `Retry in ${state.seconds}s`
          : state.status === "done"
            ? "Retry ₱"
            : "Check ₱";

  return (
    <span aria-live="polite" className="inline-flex justify-end">
      <button
        type="button"
        onClick={() => checkPrices([name], { first: true })}
        disabled={busy}
        title={state.status === "waiting" ? `Waiting because ${state.reason}` : undefined}
        aria-label={`Check Philippine price for ${name}`}
        className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-wait disabled:opacity-60"
      >
        {label}
      </button>
    </span>
  );
}

/** A checked price: "₱90 Vault", linking to the card on TCGph. */
export function PriceLabel({ result }: { result: PriceResponse }) {
  if (!result.found) {
    return <span className="text-xs text-muted">Not on TCGph</span>;
  }
  if (!result.cheapest) {
    return (
      <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:underline">
        Out of stock
      </a>
    );
  }

  const { pricePhp, store, condition, conditionLabel } = result.cheapest;
  const stores = `${formatCount(result.stores)} ${result.stores === 1 ? "store" : "stores"}`;
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Cheapest: ${conditionLabel ?? condition} at ${store}. In stock at ${stores}. Opens TCGph.`}
      className="text-xs whitespace-nowrap hover:underline"
    >
      <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
        {formatPhp(pricePhp)}
      </span>
      <span className="sr-only"> cheapest at</span>{" "}
      {/* TCGph's short shop code, e.g. "HMO" or "Vault". */}
      <span className="text-muted">{store}</span>
      <span className="sr-only">, {stores}</span>
    </a>
  );
}
