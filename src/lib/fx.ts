// US dollars in Philippine pesos. Market prices (TCGplayer, via Scryfall and
// MTGJSON) are in US dollars; the app shows them in pesos at the day's
// exchange rate. Pure, so the server and the browser share it and it's easy to test.
import { formatPhp, formatUsd } from "./format";

export interface UsdRate {
  /** Pesos per US dollar. */
  rate: number;
  /** The day the rate is for, as "2026-10-23". */
  date: string;
  source: "European Central Bank" | "ExchangeRate-API";
}

const sane = (rate: unknown): rate is number => typeof rate === "number" && Number.isFinite(rate) && rate > 1 && rate < 1000;

/** Frankfurter's answer (European Central Bank rates): { base: "USD", date, rates: { PHP } }. */
export function parseFrankfurter(json: unknown): UsdRate | null {
  const j = json as { base?: string; date?: string; rates?: { PHP?: unknown } };
  if (j?.base !== "USD" || typeof j.date !== "string" || !sane(j.rates?.PHP)) return null;
  return { rate: j.rates.PHP, date: j.date, source: "European Central Bank" };
}

/** ExchangeRate-API's open answer: { result: "success", base_code: "USD", time_last_update_unix, rates: { PHP } }. */
export function parseExchangeRateApi(json: unknown): UsdRate | null {
  const j = json as { result?: string; base_code?: string; time_last_update_unix?: number; rates?: { PHP?: unknown } };
  if (j?.result !== "success" || j.base_code !== "USD" || typeof j.time_last_update_unix !== "number" || !sane(j.rates?.PHP)) return null;
  return { rate: j.rates.PHP, date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10), source: "ExchangeRate-API" };
}

/** A dollar amount in pesos, rounded to the peso ("₱4,342"); in dollars when there's no rate. */
export function usdInPhp(usd: number, rate: UsdRate | null | undefined): string {
  return rate ? formatPhp(Math.round(usd * rate.rate)) : formatUsd(usd);
}

/** "₱63.64 per US dollar" */
export const describeRate = (rate: UsdRate) => `${formatPhp(Math.round(rate.rate * 100) / 100)} per US dollar`;
