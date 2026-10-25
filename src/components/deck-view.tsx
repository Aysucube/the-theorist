"use client";

import { AppLink as Link } from "@/components/app-link";
import { PageHeader } from "@/components/theme/page-header";
import { useEffect, useRef, useState } from "react";
import { MAX_DECK_CARDS, parseDeckList, priceDeck, type DeckCard, type StoreCoverage } from "@/lib/deck";
import { formatCount, formatPhp } from "@/lib/format";
import { lookupPrice, sleep } from "@/lib/price-lookup";
import { planCheapest, planFewestStores } from "@/lib/shopping";
import { buyAnywhere } from "@/lib/stock";
import type { CardInfo } from "@/lib/types";
import { useCardInfo, useDeck, useSavedPrices, type Lookup } from "@/lib/use-deck";
import { ShoppingList } from "./shopping-list";
import { CardLink } from "./card-link";
import { ManaCost } from "./mana";

// Cards are priced one at a time with a short breather in between. Slow, but
// it keeps well inside Scryfall's and TCGph's limits, and busy sources are
// waited out and retried, so every card ends up priced.
const PAUSE_BETWEEN_CARDS_MS = 400;

interface Progress {
  done: number;
  total: number;
  /** Rough time left, once a few cards have been timed. */
  minutesLeft?: number;
  /** Set while waiting to retry a card. */
  waiting?: { name: string; seconds: number; reason: string };
}

export function DeckView() {
  const { deck, ready, remove, importCards, clear } = useDeck();
  const { lookups, pricedAt, record, markDone } = useSavedPrices();
  // Type line and mana cost for every card, fetched once per new card and saved.
  const infoFor = useCardInfo(deck);
  const [progress, setProgress] = useState<Progress | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Stop pricing if the visitor leaves the page.
  useEffect(() => () => controller.current?.abort(), []);

  async function priceCards(names: string[]) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const startedAt = Date.now();
    setProgress({ done: 0, total: names.length });

    try {
      for (const [i, name] of names.entries()) {
        const result = await lookupPrice(name, {
          signal: current.signal,
          onWait: (waitMs, reason) =>
            setProgress((p) => p && { ...p, waiting: { name, seconds: Math.round(waitMs / 1000), reason } }),
        });
        record(name, result);
        const done = i + 1;
        const perCard = (Date.now() - startedAt) / done;
        setProgress({
          done,
          total: names.length,
          minutesLeft: done >= 3 ? Math.ceil((perCard * (names.length - done)) / 60_000) : undefined,
        });
        if (done < names.length) await sleep(PAUSE_BETWEEN_CARDS_MS, current.signal);
      }
    } catch {
      return; // aborted: the visitor left or started another run
    }
    markDone();
    setProgress(null);
  }

  if (!ready) {
    return <p className="text-muted">Loading your shopping list…</p>;
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
      <PageHeader
        feature="shopping"
        eyebrow="Philippine prices"
        description={
          <p className="text-sm">
            {formatCount(totalCards)} {totalCards === 1 ? "card" : "cards"} · saved in this browser only
          </p>
        }
        actions={deck.length > 0 && <ClearButton onClear={clear} />}
      />

      <ImportBox open={deck.length === 0} onImport={importCards} />

      {deck.length === 0 ? (
        <p className="text-muted">
          Your shopping list is empty. Paste a deck list above, or use the <strong>Add to shopping</strong> and{" "}
          <strong>+</strong> buttons when you{" "}
          <Link href="/" className="link">
            look up cards
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="surface flex flex-col gap-4 rounded-2xl p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={progress !== null}
                onClick={() => priceCards(deck.map((c) => c.name))}
                data-cast
                className="btn btn-primary h-11 px-5 disabled:cursor-wait disabled:opacity-60"
              >
                {progress
                  ? `Pricing ${progress.done} of ${progress.total}…`
                  : anyPriced
                    ? "Re-check prices"
                    : "Price this list"}
              </button>
              {!progress && pricing.unpriced.length > 0 && anyPriced && (
                <button
                  type="button"
                  onClick={() => priceCards(pricing.unpriced)}
                  className="btn btn-secondary h-11 px-4 text-sm"
                >
                  Price {pricing.unpriced.length} unchecked
                </button>
              )}
            </div>
            {progress && (
              <p role="status" className="text-sm text-muted">
                {progress.waiting ? (
                  <span className="text-accent">
                    Waiting {progress.waiting.seconds}s because {progress.waiting.reason}, then trying “
                    {progress.waiting.name}” again…
                  </span>
                ) : progress.minutesLeft !== undefined ? (
                  <>About {progress.minutesLeft} {progress.minutesLeft === 1 ? "minute" : "minutes"} left. You can keep using the app in another tab.</>
                ) : (
                  <>Working out how long this will take…</>
                )}
              </p>
            )}
            {progress && (
              <div
                role="progressbar"
                aria-label="Pricing progress"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="h-1.5 overflow-hidden rounded-full bg-subtle"
              >
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                />
              </div>
            )}
            <p className="text-xs text-muted">
              Prices one card at a time so the price sites aren’t overloaded; a busy site is waited
              out and retried automatically. Prices are cached for an hour, so re-checking soon after
              is quick.
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
              <p className="text-xs text-muted">
                Totals count each store’s stock: when one listing hasn’t enough copies, the next cheapest
                makes up the rest.
              </p>
            )}
            {pricing.unavailable.length > 0 && (
              <NameList title="Not in stock at any store" names={pricing.unavailable} />
            )}
            {failed.length > 0 && !progress && (
              <NameList title="Couldn’t check (try again)" names={failed} />
            )}
          </section>

          {!progress && <ShoppingList deck={deck} prices={prices} infoFor={infoFor} />}

          {pricing.stores.length > 0 && (
            <StoresTable stores={pricing.stores} inStock={pricing.inStock.length} />
          )}

          <CardsTable deck={deck} lookups={lookups} infoFor={infoFor} onRemove={remove} />
        </>
      )}
    </div>
  );
}

function ImportBox({ open, onImport }: { open: boolean; onImport: (cards: DeckCard[]) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  return (
    <details open={open} className="rounded-xl border border-line">
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
        <label htmlFor="deck-list" className="text-sm text-muted">
          One card per line. Exports from Moxfield, Archidekt and similar sites work as-is. Up to{" "}
          {MAX_DECK_CARDS} different cards.
        </label>
        <textarea
          id="deck-list"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"1 Atraxa, Praetors' Voice\n1 Sol Ring\n1 Arcane Signet\n10 Forest"}
          className="w-full rounded-lg border border-line-strong bg-background p-3 font-mono text-sm outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/15"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="btn btn-primary h-10 px-4 text-sm"
          >
            Add to list
          </button>
          <span role="status" className="text-sm text-muted">
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
          : "border-line-strong text-muted hover:border-red-500  "
      }`}
    >
      {confirming ? "Click again to clear" : "Clear list"}
    </button>
  );
}

function StoresTable({ stores, inStock }: { stores: StoreCoverage[]; inStock: number }) {
  return (
    <details className="rounded-xl border border-line p-4 sm:p-6">
      <summary className="cursor-pointer text-xl font-semibold">Compare all stores</summary>
      <p className="mt-1 text-sm text-muted">
        Stores with the most of your list first. A store has a card when it has enough copies;
        each total buys that store’s cheapest copies of the cards it has.
      </p>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="py-2 pr-3 font-medium">Store</th>
            <th className="py-2 pr-3 font-medium">Has</th>
            <th className="py-2 pr-3 text-right font-medium">Total</th>
            <th className="py-2 font-medium">Missing</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.store} className="border-b border-line align-top last:border-0">
              <td className="py-2 pr-3 font-medium">{s.store}</td>
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                {s.cards === inStock ? (
                  <span className="text-emerald-700 dark:text-emerald-400">All {formatCount(inStock)}</span>
                ) : (
                  `${formatCount(s.cards)} of ${formatCount(inStock)}`
                )}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{formatPhp(s.totalPhp)}</td>
              <td className="py-2 text-muted">
                {s.missing.length === 0 ? (
                  "—"
                ) : (
                  <details>
                    <summary className="cursor-pointer whitespace-nowrap">
                      {formatCount(s.missing.length)} {s.missing.length === 1 ? "card" : "cards"}
                    </summary>
                    <ul className="mt-1 text-xs">
                      {s.missing.map((name) => (
                        <li key={name}>
                          {name}
                          {name in s.tooFew && ` (only ${formatCount(s.tooFew[name])})`}
                        </li>
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
  infoFor,
  onRemove,
}: {
  deck: DeckCard[];
  lookups: Record<string, Lookup>;
  infoFor: (name: string) => CardInfo | undefined;
  onRemove: (name: string) => void;
}) {
  return (
    <section className="rounded-xl border border-line p-4 sm:p-6">
      <h2 className="text-xl font-semibold">Cards</h2>
      <ul className="mt-3">
        {deck.map((card) => {
          const info = infoFor(card.name);
          return (
            <li
              key={card.name}
              className="flex items-center gap-3 border-b border-line py-2 text-sm last:border-0"
            >
              <span className="w-8 shrink-0 text-right text-muted tabular-nums">{card.qty}×</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <CardLink name={card.name} className="min-w-0 truncate hover:underline" />
                  {info?.manaCost && <ManaCost cost={info.manaCost} />}
                </div>
                {info?.typeLine && <p className="truncate text-xs text-muted">{info.typeLine}</p>}
              </div>
              <span className="shrink-0 text-right text-xs">
                <LinePrice qty={card.qty} lookup={lookups[card.name]} />
              </span>
              <button
                type="button"
                onClick={() => onRemove(card.name)}
                aria-label={`Remove ${card.name} from shopping list`}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LinePrice({ qty, lookup }: { qty: number; lookup: Lookup | undefined }) {
  if (!lookup) return <span className="text-muted">—</span>;
  if (lookup === "error") return <span className="text-red-600 dark:text-red-400">Failed</span>;
  if (!lookup.found) return <span className="text-muted">Not on TCGph</span>;
  // The cheapest copies anywhere, which for several copies may span listings and stores.
  const purchase = buyAnywhere(lookup.byStore, qty);
  if (purchase.qty === 0) return <span className="text-muted">Out of stock</span>;

  const stores = [...new Set(purchase.parts.map((p) => p.offer.store))];
  const low = purchase.parts[0].offer.pricePhp;
  const high = purchase.parts[purchase.parts.length - 1].offer.pricePhp;
  return (
    <a href={lookup.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap hover:underline">
      <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
        {formatPhp(purchase.totalPhp)}
      </span>{" "}
      <span className="text-muted">
        {stores.length === 1 ? stores[0] : `${formatCount(stores.length)} stores`}
      </span>
      {qty > 1 && (
        <span className="block text-muted">
          {low === high ? formatPhp(low) : `${formatPhp(low)}–${formatPhp(high)}`} each
        </span>
      )}
      {purchase.qty < qty && (
        <span className="block text-accent">only {formatCount(purchase.qty)} in stock</span>
      )}
    </a>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-subtle px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
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
      <p className="text-muted">{names.join(", ")}</p>
    </div>
  );
}
