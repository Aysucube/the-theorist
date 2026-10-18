// Fetches one card's price from /api/price, waiting and retrying when a price
// source is busy instead of giving up. Used for pricing whole decks, where
// "slow but complete" beats "fast with gaps".
import { fetchJsonWithRetry, type RetryOptions } from "./retry";
import type { PriceResponse } from "./types";

export { RETRY_WAITS_MS, sleep } from "./retry";

export type Lookup = PriceResponse | "error";

export function lookupPrice(name: string, options: RetryOptions = {}): Promise<Lookup> {
  return fetchJsonWithRetry<PriceResponse>(`/api/price?name=${encodeURIComponent(name)}`, {
    busyReason: "a price source is busy",
    ...options,
  });
}
