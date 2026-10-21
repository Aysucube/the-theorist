"use client";

import { useEffect, useState } from "react";
import { formatDate, formatPercent, formatUsd } from "@/lib/format";
import { checkPrices } from "@/lib/price-queue";
import type { MarketTrends, TrendWindow } from "@/lib/trends/types";
import { CardTile } from "./card-tile";
import { Sparkline } from "./price-chart";
import { PriceCheck } from "./price-check";

const LABELS: Record<TrendWindow, string> = { day: "Past day", week: "Past week", month: "Past month" };
const ORDER: TrendWindow[] = ["day", "week", "month"];

/**
 * Surging cards for each time window, as a gallery. The cheapest copy in
 * Philippine stores loads by itself for the cards on show, one at a time
 * through the shared price queue (so a busy TCGph is waited out).
 */
export function TrendTabs({ trends }: { trends: MarketTrends }) {
  const windows = ORDER.filter((w) => (trends.windows[w]?.cards.length ?? 0) > 0);
  const [tab, setTab] = useState<TrendWindow | undefined>(windows[0]);
  const current = tab ? trends.windows[tab] : undefined;
  const namesKey = current?.cards.map((c) => c.name).join("\n") ?? "";

  useEffect(() => {
    if (namesKey) checkPrices(namesKey.split("\n"));
  }, [namesKey]);

  if (!current) {
    return <p className="text-sm text-zinc-500">No card’s market price jumped enough to stand out lately.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {windows.length > 1 && (
        <div role="tablist" aria-label="Time window" className="flex flex-wrap gap-2">
          {windows.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={w === tab}
              onClick={() => setTab(w)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${
                w === tab
                  ? "border-amber-500 bg-amber-500 text-zinc-950"
                  : "border-zinc-300 hover:border-amber-500 dark:border-zinc-700"
              }`}
            >
              {LABELS[w]}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Market prices on {formatDate(trends.pricesFrom)} compared with {formatDate(current.since)}, in US dollars. Under
        each: the cheapest copy in Philippine stores right now.
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {current.cards.map((card) => (
          <li key={card.name}>
            <CardTile name={card.name} imageUrl={card.imageUrl}>
              <span className="block tabular-nums">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">+{formatPercent(card.change)}</span>{" "}
                <span className="text-zinc-600 dark:text-zinc-400">
                  {formatUsd(card.fromUsd)} → {formatUsd(card.toUsd)}
                </span>
              </span>
              {card.history && card.history.length > 1 && (
                <span className="mt-1 block">
                  <Sparkline points={card.history} width={110} height={26} />
                </span>
              )}
              <span className="mt-0.5 block">
                <PriceCheck name={card.name} />
              </span>
            </CardTile>
          </li>
        ))}
      </ul>
    </div>
  );
}
