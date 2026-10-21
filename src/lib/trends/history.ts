// The price history explorer: the biggest price moves between any two days
// this app has saved prices for (storage.ts), with each card's daily prices
// for a chart.
import { readCardMeta, readSnapshot, savedDates, type CardMeta, type Prices } from "./storage";
import type { PricePoint, TrendCard } from "./types.ts";

export interface MoverQuery {
  /** Earlier day, e.g. "2026-10-01". */
  from: string;
  /** Later day. */
  to: string;
  /** Rises or falls. */
  direction: "up" | "down";
  /** Biggest by percentage or by dollars. */
  sort: "pct" | "usd";
  /** The higher of the two prices must be at least this (US dollars), to skip bulk. */
  minUsd: number;
  limit: number;
}

export interface Mover extends TrendCard {
  id: string;
  /** Dollars gained (or lost, negative). */
  diffUsd: number;
}

export interface HistoryResult {
  /** Every day with saved prices, oldest first. */
  dates: string[];
  from?: string;
  to?: string;
  cards: Mover[];
}

/** Moves smaller than this aren't worth listing. */
const MIN_DIFF_USD = 0.25;
export const MAX_LIMIT = 60;

/** The biggest moves between two days' prices, one per card name (its biggest printing move). */
export function findMovers(
  from: Prices,
  to: Prices,
  meta: Map<string, CardMeta>,
  { direction, sort, minUsd, limit }: Omit<MoverQuery, "from" | "to">,
): Mover[] {
  const moves: Mover[] = [];
  for (const [id, toCents] of Object.entries(to)) {
    const fromCents = from[id];
    const card = meta.get(id);
    if (fromCents === undefined || !card || fromCents <= 0) continue;
    const diffUsd = (toCents - fromCents) / 100;
    if (direction === "up" ? diffUsd < MIN_DIFF_USD : diffUsd > -MIN_DIFF_USD) continue;
    if (Math.max(fromCents, toCents) / 100 < minUsd) continue;
    moves.push({ id, ...card, fromUsd: fromCents / 100, toUsd: toCents / 100, change: toCents / fromCents - 1, diffUsd });
  }
  const size = (m: Mover) => (sort === "pct" ? Math.abs(m.change) : Math.abs(m.diffUsd));
  moves.sort((a, b) => size(b) - size(a) || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  return moves.filter((m) => !seen.has(m.name) && seen.add(m.name)).slice(0, limit);
}

/** The given printings' prices on each of the given days, oldest first (days a printing lacks are skipped). */
export async function seriesFor(ids: Set<string>, dates: string[]): Promise<Map<string, PricePoint[]>> {
  const series = new Map<string, PricePoint[]>([...ids].map((id) => [id, []]));
  if (ids.size === 0) return series;
  for (const date of [...dates].sort()) {
    const prices = await readSnapshot(date);
    if (!prices) continue;
    for (const id of ids) {
      if (prices[id] !== undefined) series.get(id)!.push({ date, usd: prices[id] / 100 });
    }
  }
  return series;
}

// Recent answers, so flipping between filters doesn't reread every snapshot.
const cache = new Map<string, HistoryResult>();
const CACHE_SIZE = 30;

/** Fills in missing or unknown days: `to` defaults to the latest, `from` to the earliest. */
export function resolveDays(dates: string[], from?: string, to?: string) {
  const latest = dates.at(-1);
  const resolvedTo = to && dates.includes(to) ? to : latest;
  const earlier = dates.filter((d) => !resolvedTo || d < resolvedTo);
  const resolvedFrom = from && earlier.includes(from) ? from : earlier[0];
  return { from: resolvedFrom, to: resolvedTo };
}

export async function priceHistory(query: Omit<MoverQuery, "from" | "to"> & { from?: string; to?: string }): Promise<HistoryResult> {
  const dates = await savedDates();
  const { from, to } = resolveDays(dates, query.from, query.to);
  if (!from || !to) return { dates, cards: [] };

  const key = JSON.stringify([dates.at(-1), dates.length, from, to, query.direction, query.sort, query.minUsd, query.limit]);
  const cached = cache.get(key);
  if (cached) return cached;

  const [fromPrices, toPrices, meta] = await Promise.all([readSnapshot(from), readSnapshot(to), readCardMeta()]);
  if (!fromPrices || !toPrices) return { dates, from, to, cards: [] };
  const cards = findMovers(fromPrices, toPrices, meta, { ...query, limit: Math.min(query.limit, MAX_LIMIT) });
  const series = await seriesFor(new Set(cards.map((c) => c.id)), dates.filter((d) => d >= from && d <= to));
  for (const card of cards) card.history = series.get(card.id);

  const result: HistoryResult = { dates, from, to, cards };
  cache.set(key, result);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return result;
}
