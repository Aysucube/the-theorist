"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { forEachLimited } from "@/lib/concurrency";
import { MAX_DECK_CARDS, parseDeckList, priceDeck, type DeckCard, type StoreCoverage } from "@/lib/deck";
import { cardHref, formatCount, formatPhp } from "@/lib/format";
import { planCheapest, planFewestStores } from "@/lib/shopping";
import type { PriceResponse } from "@/lib/types";
import { useDeck, useSavedPrices, type Lookup } from "@/lib/use-deck";
import { ShoppingList } from "./shopping-list";

// Three lookups at a time keeps a 100-card deck to a gentle trickle of TCGph requests.
const CONCURRENCY = 3;

export function DeckView() {
  const { deck, ready, remove, importCards, clear } = useDeck();
  const { lookups, pricedAt, record, markDone } = useSavedPrices();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Seconds to wait after hitting the server's rate limit.
  const [pausedFor, setPausedFor] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Stop pricing if the visitor leaves the page.
  useEffect(() => () => controller.current?.abort(), []);

  async function priceCards(names: string[]) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPausedFor(null);
    setProgress({ done: 0, total: names.length });

    await forEachLimited(
      names,
      CONCURRENCY,
      async (name) => {
        let result: Lookup;
        try {
          const res = await fetch(`/api/price?name=${encodeURIComponent(name)}`, { signal: current.signal });
          if (res.status === 429) {
            // Stop here; cards not checked yet stay "unchecked" for a later run.
            setPausedFor(Number(res.headers.get("Retry-After")) || 60);
            current.abort();
            setProgress(null);
            return;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          result = (await res.json()) as PriceResponse;
        } catch {
          result = "error";
        }
        if (current.signal.aborted) return;
        record(name, result);
        setProgress((p) => p && { ...p, done: p.done + 1 });
      },
      current.signal,
    );
    if (current.signal.aborted) return;
    markDone();
    setProgress(null);
  }

  if (!ready) {
    return <p className="text-zinc-500">Loading your deck…</p>;
  }

  const prices = Object.fromEntries(
    Object.entries(lookups).map(([name, lookup]) => [name, lookup === "error" ? undefined : lookup]),
  );
  const pricing = priceDeck(deck, prices);
  const oneStop = planFewestStores(deck, prices);
  const cheapest = planCheapest(deck, prices);
  const totalCards = deck.reduce((sum, c) => sum + c.qty, 0);
  const anyPriced = pricing.inStock.length + pricing.unavailable.length > 0;
  const failed = deck.filter((c) => lookups[c.name] === "error").map((c) => c.name);
  const storesLabel = (n: number) => `${formatCount(n)} ${n === 1 ? "store" : "stores"}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your deck</h1>
          <p className="text-sm text-zinc-500">
            {formatCount(totalCards)} {totalCards === 1 ? "card" : "cards"} · saved in this browser only
          </p>
        </div>
        {deck.length > 0 && <ClearButton onClear={clear} />}
      </div>

      <ImportBox open={deck.length === 0} onImport={importCards} />

      {deck.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          Your deck is empty. Paste a list above, or use the <strong>Add to deck</strong> and{" "}
          <strong>+</strong> buttons when you{" "}
          <Link href="/" className="text-amber-700 hover:underline dark:text-amber-400">
            look up cards
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={progress !== null}
                onClick={() => priceCards(deck.map((c) => c.name))}
                className="h-11 rounded-lg bg-amber-500 px-5 font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
              >
                {progress
                  ? `Pricing ${progress.done} of ${progress.total}…`
                  : anyPriced
                    ? "Re-check prices"
                    : "Price this deck"}
              </button>
              {!progress && pricing.unpriced.length > 0 && anyPriced && (
                <button
                  type="button"
                  onClick={() => priceCards(pricing.unpriced)}
                  className="h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium hover:border-amber-500 dark:border-zinc-700"
                >
                  Price {pricing.unpriced.length} unchecked
                </button>
              )}
            </div>
            {pausedFor !== null && !progress && (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                Paused: too many price checks in a short time. Wait about {pausedFor} seconds, then
                continue with the unchecked cards.
              </p>
            )}
            {progress && (
              <div
                role="progressbar"
                aria-label="Pricing progress"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
              >
                <div
                  className="h-full bg-amber-500 transition-[width]"
                  style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                />
              </div>
            )}
            <p className="text-xs text-zinc-500">
              Looks up each card on TCGph, {CONCURRENCY} at a time. Prices are cached for an hour, so
              re-checking soon after is quick.
              {pricedAt > 0 && !progress && (
                <> Last checked {new Date(pricedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}.</>
              )}
            </p>

            {anyPriced && (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat
                  label="Cards in stock"
                  value={`${formatCount(pricing.inStock.length)} of ${formatCount(deck.length)}`}
                />
                <Stat
                  label={`Fewest stops · ${storesLabel(oneStop.stops.length)}`}
                  value={formatPhp(oneStop.totalPhp)}
                />
                <Stat
                  label={`Cheapest · ${storesLabel(cheapest.stops.length)}`}
                  value={formatPhp(cheapest.totalPhp)}
                />
              </dl>
            )}
            {anyPriced && (
              <p className="text-xs text-zinc-500">
                Totals assume a store has enough copies; TCGph only shows stock per listing.
              </p>
            )}
            {pricing.unavailable.length > 0 && (
              <NameList title="Not in stock at any store" names={pricing.unavailable} />
            )}
            {failed.length > 0 && !progress && (
              <NameList title="Couldn’t check (try again)" names={failed} />
            )}
          </section>

          {!progress && <ShoppingList deck={deck} prices={prices} />}

          {pricing.stores.length > 0 && (
            <StoresTable stores={pricing.stores} inStock={pricing.inStock.length} />
          )}

          <CardsTable deck={deck} lookups={lookups} onRemove={remove} />
        </>
      )}
    </div>
  );
}

function ImportBox({ open, onImport }: { open: boolean; onImport: (cards: DeckCard[]) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  return (
    <details open={open} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer px-4 py-3 font-medium">Paste a deck list</summary>
      <form
        className="flex flex-col gap-3 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          const cards = parseDeckList(text);
          if (cards.length === 0) {
            setMessage("No card names found. Put one card per line, like “1 Sol Ring”.");
            return;
          }
          onImport(cards);
          setText("");
          setMessage(`Added ${cards.length} ${cards.length === 1 ? "card" : "cards"}.`);
        }}
      >
        <label htmlFor="deck-list" className="text-sm text-zinc-600 dark:text-zinc-400">
          One card per line. Exports from Moxfield, Archidekt and similar sites work as-is. Up to{" "}
          {MAX_DECK_CARDS} different cards.
        </label>
        <textarea
          id="deck-list"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"1 Atraxa, Praetors' Voice\n1 Sol Ring\n1 Arcane Signet\n10 Forest"}
          className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="h-10 rounded-lg bg-amber-500 px-4 text-sm font-medium text-zinc-950 hover:bg-amber-400"
          >
            Add to deck
          </button>
          <span role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            {message}
          </span>
        </div>
      </form>
    </details>
  );
}

function ClearButton({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (confirming) onClear();
        setConfirming(!confirming);
      }}
      onBlur={() => setConfirming(false)}
      className={`h-9 rounded-lg border px-3 text-sm ${
        confirming
          ? "border-red-600 text-red-700 dark:text-red-400"
          : "border-zinc-300 text-zinc-600 hover:border-red-500 dark:border-zinc-700 dark:text-zinc-400"
      }`}
    >
      {confirming ? "Click again to clear" : "Clear deck"}
    </button>
  );
}

function StoresTable({ stores, inStock }: { stores: StoreCoverage[]; inStock: number }) {
  return (
    <details className="rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800">
      <summary className="cursor-pointer text-xl font-semibold">Compare all stores</summary>
      <p className="mt-1 text-sm text-zinc-500">
        Stores with the most of your deck first. Each total uses that store’s cheapest copy of
        the cards it has.
      </p>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2 pr-3 font-medium">Store</th>
            <th className="py-2 pr-3 font-medium">Has</th>
            <th className="py-2 pr-3 text-right font-medium">Total</th>
            <th className="py-2 font-medium">Missing</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.store} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900">
              <td className="py-2 pr-3 font-medium">{s.store}</td>
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                {s.cards === inStock ? (
                  <span className="text-emerald-700 dark:text-emerald-400">All {formatCount(inStock)}</span>
                ) : (
                  `${formatCount(s.cards)} of ${formatCount(inStock)}`
                )}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{formatPhp(s.totalPhp)}</td>
              <td className="py-2 text-zinc-600 dark:text-zinc-400">
                {s.missing.length === 0 ? (
                  "—"
                ) : (
                  <details>
                    <summary className="cursor-pointer whitespace-nowrap">
                      {formatCount(s.missing.length)} {s.missing.length === 1 ? "card" : "cards"}
                    </summary>
                    <ul className="mt-1 text-xs">
                      {s.missing.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function CardsTable({
  deck,
  lookups,
  onRemove,
}: {
  deck: DeckCard[];
  lookups: Record<string, Lookup>;
  onRemove: (name: string) => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800">
      <h2 className="text-xl font-semibold">Cards</h2>
      <ul className="mt-3">
        {deck.map((card) => (
          <li
            key={card.name}
            className="flex items-center gap-3 border-b border-zinc-100 py-2 text-sm last:border-0 dark:border-zinc-900"
          >
            <span className="w-8 shrink-0 text-right text-zinc-500 tabular-nums">{card.qty}×</span>
            <Link href={cardHref(card.name)} prefetch={false} className="min-w-0 flex-1 truncate hover:underline">
              {card.name}
            </Link>
            <span className="shrink-0 text-right text-xs">
              <LinePrice qty={card.qty} lookup={lookups[card.name]} />
            </span>
            <button
              type="button"
              onClick={() => onRemove(card.name)}
              aria-label={`Remove ${card.name} from deck`}
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-400"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LinePrice({ qty, lookup }: { qty: number; lookup: Lookup | undefined }) {
  if (!lookup) return <span className="text-zinc-400">—</span>;
  if (lookup === "error") return <span className="text-red-600 dark:text-red-400">Failed</span>;
  if (!lookup.found) return <span className="text-zinc-500">Not on TCGph</span>;
  if (!lookup.cheapest) return <span className="text-zinc-500">Out of stock</span>;

  const { pricePhp, store } = lookup.cheapest;
  return (
    <a href={lookup.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap hover:underline">
      <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
        {formatPhp(pricePhp * qty)}
      </span>{" "}
      <span className="text-zinc-600 dark:text-zinc-400">{store}</span>
      {qty > 1 && <span className="block text-zinc-500">{formatPhp(pricePhp)} each</span>}
    </a>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function NameList({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="text-sm">
      <p className="font-medium">
        {title} ({formatCount(names.length)})
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">{names.join(", ")}</p>
    </div>
  );
}
