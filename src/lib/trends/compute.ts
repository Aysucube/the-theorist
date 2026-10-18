// Which cards' market prices are surging: shared by the app's own daily
// tracking and scripts/build-market-trends.ts (run by Node directly, so this
// file only has type imports).
import type { TrendCard, TrendWindow } from "./types.ts";

/** What counts as a surge worth showing, not penny-stock noise. */
export const SURGE_RULES = {
  /** The card costs at least this much now (US dollars). */
  minNowUsd: 2,
  /** ...and cost at least this much before, so $0.05 → $0.20 isn't "+300%". */
  minThenUsd: 0.25,
  /** ...and went up by at least this much. */
  minGainUsd: 0.5,
  /** ...and by at least this share (0.1 = +10%). */
  minChange: 0.1,
  /** Cards shown per time window. */
  limit: 24,
};

/** How far back each window looks, and how much older the comparison price may be if a day is missing. */
export const WINDOWS: Record<TrendWindow, { days: number; slackDays: number }> = {
  day: { days: 1, slackDays: 3 },
  week: { days: 7, slackDays: 3 },
  month: { days: 30, slackDays: 5 },
};

/** "2026-10-18" minus 7 days → "2026-10-11". */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The latest date in `dates` that's on or before `target` but no earlier than
 * `oldest`, or undefined. Dates are ISO strings, which sort as text.
 */
export function dateOnOrBefore(dates: Iterable<string>, target: string, oldest: string): string | undefined {
  let best: string | undefined;
  for (const date of dates) {
    if (date <= target && date >= oldest && (!best || date > best)) best = date;
  }
  return best;
}

/** The surge from `thenUsd` to `nowUsd`, or null when it doesn't pass SURGE_RULES. */
export function surge(thenUsd: number, nowUsd: number): number | null {
  if (nowUsd < SURGE_RULES.minNowUsd || thenUsd < SURGE_RULES.minThenUsd) return null;
  if (nowUsd - thenUsd < SURGE_RULES.minGainUsd) return null;
  const change = nowUsd / thenUsd - 1;
  return change >= SURGE_RULES.minChange ? change : null;
}

/**
 * The biggest surges, one per card name (a card's printings can all spike
 * together), biggest first, cut to SURGE_RULES.limit.
 */
export function topSurges(cards: TrendCard[]): TrendCard[] {
  const best = new Map<string, TrendCard>();
  for (const card of cards) {
    const seen = best.get(card.name);
    if (!seen || seen.change < card.change) best.set(card.name, card);
  }
  return [...best.values()]
    .sort((a, b) => b.change - a.change || b.toUsd - b.fromUsd - (a.toUsd - a.fromUsd) || a.name.localeCompare(b.name))
    .slice(0, SURGE_RULES.limit);
}

/** Scryfall's image for a printing, from its Scryfall id alone. */
export function scryfallImage(scryfallId: string, size: "normal" | "small" = "normal"): string {
  return `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}
