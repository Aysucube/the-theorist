// Fetches one card's price from /api/price, waiting and retrying when a price
// source is busy instead of giving up. Used for pricing whole decks, where
// "slow but complete" beats "fast with gaps".
import type { PriceResponse } from "./types";

/** Waits before each retry after a failure: covers Scryfall's 30-second lockout and then some. */
export const RETRY_WAITS_MS = [5_000, 10_000, 20_000, 30_000, 30_000];

export type Lookup = PriceResponse | "error";

/** A sleep that ends early (rejecting) when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export async function lookupPrice(
  name: string,
  {
    signal,
    fetchFn = fetch,
    wait = sleep,
    onWait,
  }: {
    signal?: AbortSignal;
    fetchFn?: typeof fetch;
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
    /** Told before each wait, so the page can say what's happening. */
    onWait?: (waitMs: number, reason: string) => void;
  } = {},
): Promise<Lookup> {
  let failures = 0;
  for (;;) {
    let res: Response | undefined;
    try {
      res = await fetchFn(`/api/price?name=${encodeURIComponent(name)}`, { signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      // Network hiccup: treated like a busy source below.
    }
    if (res?.ok) return (await res.json()) as PriceResponse;
    if (res?.status === 400) return "error"; // a bad name won't get better by retrying

    let waitMs: number;
    let reason: string;
    if (res?.status === 429) {
      // The app's own per-visitor limit. Waiting as long as it says always
      // works, so this doesn't use up a retry.
      waitMs = (Number(res.headers.get("Retry-After")) || 60) * 1000;
      reason = "the app’s request limit";
    } else {
      if (failures >= RETRY_WAITS_MS.length) return "error";
      waitMs = RETRY_WAITS_MS[failures++];
      reason = "a price source is busy";
    }
    onWait?.(waitMs, reason);
    await wait(waitMs, signal);
  }
}
