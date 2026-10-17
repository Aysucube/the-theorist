"use client";

import { useState } from "react";
import type { DeckCard } from "@/lib/deck";
import { formatCount, formatPhp } from "@/lib/format";
import { orderText, planCheapest, planFewestStores, type ShoppingStop } from "@/lib/shopping";
import type { PriceResponse } from "@/lib/types";
import { useBought } from "@/lib/use-deck";
import { CardLink } from "./card-link";

/** Where to buy the deck with the fewest store visits, one checklist per store. */
export function ShoppingList({
  deck,
  prices,
}: {
  deck: DeckCard[];
  prices: Record<string, PriceResponse | undefined>;
}) {
  const plan = planFewestStores(deck, prices);
  const cheapest = planCheapest(deck, prices);
  const { isBought, toggle, reset } = useBought();

  if (plan.stops.length === 0) return null;

  const items = plan.stops.flatMap((s) => s.items);
  const boughtCount = items.filter((i) => isBought(i.name)).length;
  const extra = plan.totalPhp - cheapest.totalPhp;
  const stopCount = plan.stops.length;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800">
      <div>
        <h2 className="text-xl font-semibold">Shopping list</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {stopCount === 1 ? (
            <>
              <strong>{plan.stops[0].store}</strong> has everything in stock:{" "}
              <strong>{formatPhp(plan.totalPhp)}</strong> in one stop.
            </>
          ) : (
            <>
              No single store has everything. Fewest stops: <strong>{stopCount} stores</strong> for{" "}
              <strong>{formatPhp(plan.totalPhp)}</strong>.
            </>
          )}
          {extra > 0 && (
            <>
              {" "}
              Buying each card wherever it’s cheapest would save {formatPhp(extra)} but take{" "}
              {cheapest.stops.length} stores.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="tabular-nums">
          Bought {formatCount(boughtCount)} of {formatCount(items.length)}
        </span>
        {boughtCount > 0 && (
          <button type="button" onClick={reset} className="text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300">
            Clear ticks
          </button>
        )}
      </div>

      <ol className="flex flex-col gap-4">
        {plan.stops.map((stop, i) => (
          <StopCard key={stop.store} stop={stop} number={i + 1} isBought={isBought} onToggle={toggle} />
        ))}
      </ol>

      {plan.unavailable.length > 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium">Not in stock anywhere ({formatCount(plan.unavailable.length)}):</span>{" "}
          {plan.unavailable.join(", ")}
        </p>
      )}
    </section>
  );
}

function StopCard({
  stop,
  number,
  isBought,
  onToggle,
}: {
  stop: ShoppingStop;
  number: number;
  isBought: (name: string) => boolean;
  onToggle: (name: string) => void;
}) {
  const cards = stop.items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <li className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <h3 className="font-semibold">
          <span className="text-zinc-500">{number}.</span> {stop.store}
          <span className="ml-2 text-sm font-normal text-zinc-500">
            {formatCount(cards)} {cards === 1 ? "card" : "cards"} · {formatPhp(stop.subtotalPhp)}
          </span>
        </h3>
        <CopyOrderButton text={orderText(stop)} store={stop.store} />
      </div>
      <ul>
        {stop.items.map((item) => {
          const bought = isBought(item.name);
          return (
            <li
              key={item.name}
              className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 dark:border-zinc-900"
            >
              <input
                type="checkbox"
                checked={bought}
                onChange={() => onToggle(item.name)}
                aria-label={`Bought ${item.name}`}
                className="size-4 shrink-0 accent-emerald-600"
              />
              <div className={`min-w-0 flex-1 ${bought ? "text-zinc-400 line-through" : ""}`}>
                <div className="truncate">
                  {item.qty > 1 && <span className="tabular-nums">{item.qty}× </span>}
                  <CardLink name={item.name} className="hover:underline" />
                </div>
                <div className="truncate text-xs text-zinc-500">
                  {[item.offer.printing, item.offer.conditionLabel ?? item.offer.condition].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <a
                  href={item.offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-700 tabular-nums hover:underline dark:text-emerald-400"
                  title={`Open this listing on ${stop.store}’s site`}
                >
                  {formatPhp(item.lineTotalPhp)} ↗
                </a>
                {item.qty > 1 && (
                  <div className="text-xs text-zinc-500 tabular-nums">{formatPhp(item.offer.pricePhp)} each</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function CopyOrderButton({ text, store }: { text: string; store: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      // Clipboard access can be blocked (some phones, embedded browsers): show the text to copy by hand.
      setStatus("manual");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy order text for ${store}`}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:border-amber-500 dark:border-zinc-700"
      >
        <span aria-live="polite">{status === "copied" ? "Copied ✓" : "Copy order"}</span>
      </button>
      {status === "manual" && (
        <div className="w-full">
          <label className="text-xs text-zinc-500">
            Couldn’t copy automatically. Select the text below and copy it:
            <textarea
              readOnly
              value={text}
              rows={text.split("\n").length}
              ref={(el) => el?.select()}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            />
          </label>
        </div>
      )}
    </>
  );
}
