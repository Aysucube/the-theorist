"use client";

import { useEffect, useId, useState } from "react";
import { formatCount, formatDate, formatPercent, formatUsd } from "@/lib/format";
import { checkPrices } from "@/lib/price-queue";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { HistoryResult, Mover } from "@/lib/trends/history";
import { CardLink } from "./card-link";
import { PriceChart, Sparkline } from "./price-chart";
import { PriceCheck } from "./price-check";

type Filters = { from?: string; to?: string; direction: "up" | "down"; sort: "pct" | "usd"; minUsd: number };

/** PH prices load by themselves for this many of the listed cards. */
const AUTO_PRICES = 12;

/**
 * Explore the prices this app has saved: pick any two days and see the
 * biggest rises (or falls) between them, by percentage or by dollars, each
 * with its price line and the cheapest copy in Philippine stores.
 */
export function PriceHistoryExplorer() {
  const id = useId();
  const [filters, setFilters] = useState<Filters>({ direction: "up", sort: "pct", minUsd: 2 });
  // The last answer and the query it was for; while a new query loads, the old answer stays on screen.
  const [loaded, setLoaded] = useState<{ query: string; result: HistoryResult | "error" } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const query = new URLSearchParams({
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    dir: filters.direction,
    sort: filters.sort,
    min: String(filters.minUsd),
    limit: "30",
  }).toString();

  useEffect(() => {
    let cancelled = false;
    void fetchJsonWithRetry<HistoryResult>(`/api/trends/history?${query}`, { busyReason: "the server is busy" }).then((r) => {
      if (cancelled) return;
      setLoaded({ query, result: r });
      if (r !== "error") checkPrices(r.cards.slice(0, AUTO_PRICES).map((c) => c.name));
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const state = loaded?.query !== query ? "loading" : loaded.result === "error" ? "error" : "done";
  const result = loaded && loaded.result !== "error" ? loaded.result : null;

  const dates = result?.dates ?? [];
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  if (state !== "loading" && dates.length < 2) {
    return (
      <p className="text-sm text-muted">
        The price history fills in as this app runs, one day of prices at a time
        {dates.length === 1 ? ` (1 day saved, ${formatDate(dates[0])})` : ""}. Come back tomorrow to compare days.
      </p>
    );
  }

  const select = "h-9 rounded-lg border border-line-strong bg-background px-2 text-sm  ";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        {formatCount(dates.length)} days of market prices saved by this app
        {dates.length > 0 && `, ${formatDate(dates[0])} to ${formatDate(dates.at(-1)!)}`}. Up to 90 days are kept.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted" htmlFor={`${id}-from`}>
          From
          <select id={`${id}-from`} className={select} value={result?.from ?? ""} onChange={(e) => set({ from: e.target.value })}>
            {dates.slice(0, -1).map((d) => (
              <option key={d} value={d}>
                {formatDate(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted" htmlFor={`${id}-to`}>
          To
          <select id={`${id}-to`} className={select} value={result?.to ?? ""} onChange={(e) => set({ to: e.target.value })}>
            {dates.slice(1).map((d) => (
              <option key={d} value={d}>
                {formatDate(d)}
              </option>
            ))}
          </select>
        </label>
        <Toggle
          label="Show"
          value={filters.direction}
          options={[
            ["up", "Biggest rises"],
            ["down", "Biggest falls"],
          ]}
          onChange={(direction) => set({ direction })}
        />
        <Toggle
          label="Rank by"
          value={filters.sort}
          options={[
            ["pct", "%"],
            ["usd", "$"],
          ]}
          onChange={(sort) => set({ sort })}
        />
        <label className="flex flex-col gap-1 text-xs text-muted" htmlFor={`${id}-min`}>
          At least
          <select id={`${id}-min`} className={select} value={filters.minUsd} onChange={(e) => set({ minUsd: Number(e.target.value) })}>
            {[0.5, 1, 2, 5, 10, 25, 50].map((v) => (
              <option key={v} value={v}>
                {formatUsd(v)}
              </option>
            ))}
          </select>
        </label>
        {state === "loading" && (
          <span className="flex h-9 items-center gap-2 text-xs text-muted">
            <span aria-hidden className="size-4 spinner" />
            Comparing…
          </span>
        )}
      </div>

      {state === "error" ? (
        <p className="text-sm text-muted">Couldn’t read the saved prices. Try another range.</p>
      ) : result && result.cards.length === 0 && state === "done" ? (
        <p className="text-sm text-muted">No card moved that much between these days. Try a longer range or a lower minimum.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {result?.cards.map((card, i) => (
            <Row key={card.id} rank={i + 1} card={card} open={open === card.id} onToggle={() => setOpen(open === card.id ? null : card.id)} />
          ))}
        </ol>
      )}
      <p className="text-xs text-muted">
        Market prices: TCGplayer (US dollars), from Scryfall. Commander-legal cards only; each card’s biggest-moving printing
        is shown.
      </p>
    </div>
  );
}

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <div role="radiogroup" aria-label={label} className="flex h-9 overflow-hidden rounded-lg border border-line-strong">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === value}
            onClick={() => onChange(v)}
            className={`px-3 text-sm ${v === value ? "bg-foreground font-medium text-background" : "bg-background text-foreground/80 hover:bg-subtle   "}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ rank, card, open, onToggle }: { rank: number; card: Mover; open: boolean; onToggle: () => void }) {
  const up = card.diffUsd >= 0;
  const tone = up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  return (
    <li className="px-3 py-2.5">
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_130px_auto_auto]">
        <span className="text-xs text-muted tabular-nums">{rank}</span>
        <div className="min-w-0">
          <CardLink name={card.name} className="block truncate text-sm font-medium hover:underline" />
          <p className="truncate text-xs text-muted">
            {card.setCode} · {formatUsd(card.fromUsd)} → {formatUsd(card.toUsd)}
          </p>
        </div>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${card.name}'s price chart`} className="hidden sm:block">
          <Sparkline points={card.history ?? []} width={130} height={34} />
        </button>
        <div className={`text-right text-sm font-semibold tabular-nums ${tone}`}>
          {up ? "+" : ""}
          {formatPercent(card.change)}
          <span className="block text-xs font-normal">
            {up ? "+" : "−"}
            {formatUsd(Math.abs(card.diffUsd))}
          </span>
        </div>
        <div className="col-span-3 flex items-center justify-end gap-3 sm:col-span-1">
          <button type="button" onClick={onToggle} className="text-xs link sm:hidden">
            {open ? "Hide chart" : "Chart"}
          </button>
          <PriceCheck name={card.name} />
        </div>
      </div>
      {open && (
        <div className="mt-3 rounded-lg bg-surface p-2">
          <PriceChart points={card.history ?? []} />
        </div>
      )}
    </li>
  );
}
