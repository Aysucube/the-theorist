"use client";

import { useState } from "react";
import { formatCount, formatPhp } from "@/lib/format";
import type { PriceResponse } from "@/lib/types";

type State =
  | { status: "idle" | "loading" | "error" }
  | { status: "done"; result: PriceResponse };

/**
 * A "Check ₱" button that looks up a card's cheapest Philippine price only
 * when clicked, so a list of recommendations doesn't fire dozens of TCGph requests.
 */
export function PriceCheck({ name }: { name: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function check() {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/price?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState({ status: "done", result: (await res.json()) as PriceResponse });
    } catch {
      setState({ status: "error" });
    }
  }

  return (
    // Announces the price to screen readers when it arrives.
    <span aria-live="polite" className="inline-flex justify-end">
      {state.status === "done" ? (
        <Result result={state.result} />
      ) : (
        <button
          type="button"
          onClick={check}
          disabled={state.status === "loading"}
          aria-label={`Check Philippine price for ${name}`}
          className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-zinc-700 transition-colors hover:border-amber-500 hover:text-amber-700 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
        >
          {state.status === "loading" ? "Checking…" : state.status === "error" ? "Retry ₱" : "Check ₱"}
        </button>
      )}
    </span>
  );
}

function Result({ result }: { result: PriceResponse }) {
  if (!result.found) {
    return <span className="text-xs text-zinc-500">Not on TCGph</span>;
  }
  if (!result.cheapest) {
    return (
      <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 hover:underline">
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
      className="text-xs font-semibold whitespace-nowrap text-emerald-700 tabular-nums hover:underline dark:text-emerald-400"
    >
      {formatPhp(pricePhp)}
      <span className="sr-only"> cheapest at {store}, {stores}</span>
    </a>
  );
}
