// "Slow but complete": wait and try again when something is busy, instead of
// giving up. Shared by deck pricing, card info, hover previews and their images.

/** Waits before each retry after a failure: covers Scryfall's 30-second lockout and then some. */
export const RETRY_WAITS_MS = [5_000, 10_000, 20_000, 30_000, 30_000];

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

export interface RetryOptions {
  /** Method, headers and body, e.g. for a POST. */
  init?: Omit<RequestInit, "signal">;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Told before each wait, so the page can say what's happening. */
  onWait?: (waitMs: number, reason: string) => void;
  /** What to call a failed attempt in onWait, e.g. "a price source is busy". */
  busyReason?: string;
}

/**
 * GETs JSON from one of our own API routes, retrying network errors and
 * server errors after RETRY_WAITS_MS, and waiting out our own rate limit
 * (HTTP 429, as long as Retry-After says, without spending a retry).
 * Returns "error" only when every retry failed or the request was rejected (400).
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  { init, signal, fetchFn = fetch, wait = sleep, onWait, busyReason = "a source is busy" }: RetryOptions = {},
): Promise<T | "error"> {
  let failures = 0;
  for (;;) {
    let res: Response | undefined;
    try {
      res = await fetchFn(url, { ...init, signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      // Network hiccup: treated like a busy source below.
    }
    if (res?.ok) return (await res.json()) as T;
    if (res?.status === 400) return "error"; // a bad request won't get better by retrying

    let waitMs: number;
    let reason: string;
    if (res?.status === 429) {
      waitMs = (Number(res.headers.get("Retry-After")) || 60) * 1000;
      reason = "the app’s request limit";
    } else {
      if (failures >= RETRY_WAITS_MS.length) return "error";
      waitMs = RETRY_WAITS_MS[failures++];
      reason = busyReason;
    }
    onWait?.(waitMs, reason);
    await wait(waitMs, signal);
  }
}
