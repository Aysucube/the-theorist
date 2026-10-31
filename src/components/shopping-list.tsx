"use client";

import { useState } from "react";
import type { DeckCard } from "@/lib/deck";
import { formatCount, formatPhp } from "@/lib/format";
import { orderText, planCheapest, planFewestStores, tickKey, type ShoppingItem, type ShoppingStop } from "@/lib/shopping";
import type { CardInfo, ListingBrief, PriceResponse } from "@/lib/types";
import { useBought } from "@/lib/use-deck";
import { CardLink } from "./card-link";
import { useCheaperAlternatives } from "./cheaper-alternatives";
import { ManaCost } from "./mana";

/** Where to buy the deck with the fewest store visits, one checklist per store. */
export function ShoppingList({
  deck,
  prices,
  infoFor,
}: {
  deck: DeckCard[];
  prices: Record<string, PriceResponse | undefined>;
  /** Type line and mana cost per card, when known. */
  infoFor: (name: string) => CardInfo | undefined;
}) {
  const plan = planFewestStores(deck, prices);
  const cheapest = planCheapest(deck, prices);
  const { isBought, toggle, reset } = useBought();

  if (plan.stops.length === 0) return null;

  const ticks = plan.stops.flatMap((s) => s.items.map((i) => tickKey(i, s.store)));
  const boughtCount = ticks.filter(isBought).length;
  const extra = plan.totalPhp - cheapest.totalPhp;
  const stopCount = plan.stops.length;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Shopping list</h2>
        <p className="mt-1 text-sm text-muted">
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
          Bought {formatCount(boughtCount)} of {formatCount(ticks.length)}
        </span>
        {boughtCount > 0 && (
          <button type="button" onClick={reset} className="text-muted underline hover:text-foreground">
            Clear ticks
          </button>
        )}
      </div>

      <ol className="flex flex-col gap-4">
        {plan.stops.map((stop, i) => (
          <StopCard key={stop.store} stop={stop} number={i + 1} isBought={isBought} onToggle={toggle} infoFor={infoFor} />
        ))}
      </ol>

      {plan.short.length > 0 && (
        <p className="text-sm text-accent">
          <span className="font-medium">Not enough copies in stock ({formatCount(plan.short.length)}):</span>{" "}
          {plan.short.map((c) => `${c.name} (${formatCount(c.inStock)} of ${formatCount(c.qty)})`).join(", ")}. The
          list above buys every copy there is.
        </p>
      )}

      {plan.unavailable.length > 0 && (
        <p className="text-sm text-muted">
          <span className="font-medium">Not in stock anywhere ({formatCount(plan.unavailable.length)}):</span>{" "}
          {plan.unavailable.join(", ")}
        </p>
      )}
    </section>
  );
}

/** Which copy a listing is, so the store hands over the right one. */
const copyDetails = (offer: ListingBrief) => [offer.printing, offer.conditionLabel ?? offer.condition];

function StopCard({
  stop,
  number,
  isBought,
  onToggle,
  infoFor,
}: {
  stop: ShoppingStop;
  number: number;
  isBought: (name: string) => boolean;
  onToggle: (name: string) => void;
  infoFor: (name: string) => CardInfo | undefined;
}) {
  const cards = stop.items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <li className="rounded-lg border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h3 className="font-semibold">
          <span className="text-muted">{number}.</span> {stop.store}
          <span className="ml-2 text-sm font-normal text-muted">
            {formatCount(cards)} {cards === 1 ? "card" : "cards"} · {formatPhp(stop.subtotalPhp)}
          </span>
        </h3>
        <CopyOrderButton text={orderText(stop)} store={stop.store} />
      </div>
      <ul>
        {stop.items.map((item) => {
          const tick = tickKey(item, stop.store);
          return (
            <StopItem
              key={item.name}
              item={item}
              store={stop.store}
              bought={isBought(tick)}
              onToggle={() => onToggle(tick)}
              info={infoFor(item.name)}
            />
          );
        })}
      </ul>
    </li>
  );
}

function StopItem({
  item,
  store,
  bought,
  onToggle,
  info,
}: {
  item: ShoppingItem;
  store: string;
  bought: boolean;
  onToggle: () => void;
  info: CardInfo | undefined;
}) {
  const [first, ...more] = item.parts;
  const { arrow, menu } = useCheaperAlternatives(item.name, first.offer.pricePhp);
  return (
    <li className="border-b border-line px-3 py-2 text-sm last:border-0">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={bought}
          onChange={onToggle}
          aria-label={`Bought ${item.name}`}
          className="size-4 shrink-0 accent-emerald-600"
        />
        <div className={`min-w-0 flex-1 ${bought ? "text-muted line-through" : ""}`}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate">
              {item.qty > 1 && <span className="tabular-nums">{item.qty}× </span>}
              <CardLink name={item.name} className="hover:underline" />
            </span>
            {info?.manaCost && <ManaCost cost={info.manaCost} />}
            {arrow}
          </div>
          <div className="truncate text-xs text-muted">
            {[info?.typeLine, ...(more.length === 0 ? copyDetails(first.offer) : [])].filter(Boolean).join(" · ")}
          </div>
          {more.length > 0 && (
            // One listing hasn't enough copies: say which copies to take from each.
            <ul className="text-xs text-muted">
              {item.parts.map((part, i) => (
                <li key={i} className="truncate tabular-nums">
                  {part.qty}× {copyDetails(part.offer).filter(Boolean).join(" · ")} at{" "}
                  <a href={part.offer.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {formatPhp(part.offer.pricePhp)}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {item.alsoAt.length > 0 && (
            <div className="text-xs text-accent">
              + {item.alsoAt.map((a) => `${formatCount(a.qty)} more at ${a.store}`).join(", ")}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <a
            href={first.offer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-700 tabular-nums hover:underline dark:text-emerald-400"
            title={`Open this listing on ${store}’s site`}
          >
            {formatPhp(item.lineTotalPhp)} ↗
          </a>
          {item.qty > 1 && more.length === 0 && (
            <div className="text-xs text-muted tabular-nums">{formatPhp(first.offer.pricePhp)} each</div>
          )}
          <div className="text-xs text-muted tabular-nums">{formatCount(item.stock)} in stock</div>
        </div>
      </div>
      {menu}
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
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-medium hover:border-accent/50"
      >
        <span aria-live="polite">{status === "copied" ? "Copied ✓" : "Copy order"}</span>
      </button>
      {status === "manual" && (
        <div className="w-full">
          <label className="text-xs text-muted">
            Couldn’t copy automatically. Select the text below and copy it:
            <textarea
              readOnly
              value={text}
              rows={text.split("\n").length}
              ref={(el) => el?.select()}
              className="mt-1 w-full rounded-lg border border-line-strong bg-background p-2 font-mono text-xs text-foreground/90"
            />
          </label>
        </div>
      )}
    </>
  );
}
