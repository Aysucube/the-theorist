// A per-key fixed-window request counter, kept in this server process's memory.
// On one server it's exact. On serverless hosts each instance counts on its
// own, so pair it with the host's firewall rate limits for a shared cap (see README).

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets; send as Retry-After when blocked. */
  retryAfterSeconds: number;
}

/** Stop the map growing without bound under traffic from many addresses. */
const MAX_KEYS = 10_000;

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  function prune(time: number) {
    for (const [key, w] of windows) {
      if (w.resetAt <= time) windows.delete(key);
    }
    // Still full of live windows: drop the oldest (Maps iterate in insertion order).
    for (const key of windows.keys()) {
      if (windows.size < MAX_KEYS) break;
      windows.delete(key);
    }
  }

  return function check(key: string): RateLimitResult {
    const time = now();
    let w = windows.get(key);
    if (!w || w.resetAt <= time) {
      if (!w && windows.size >= MAX_KEYS) prune(time);
      w = { count: 0, resetAt: time + windowMs };
      windows.set(key, w);
    }
    w.count++;
    return {
      ok: w.count <= limit,
      remaining: Math.max(0, limit - w.count),
      retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - time) / 1000)),
    };
  };
}

/** The visitor's address as reported by the host's proxy, or a shared fallback. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
