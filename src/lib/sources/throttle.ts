// Spaces out requests to a rate-limited API within this server process, and
// stops calling it for a while after it answers "too many requests" (HTTP 429).

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ThrottledError extends Error {}

export function createThrottle({
  spacingMs,
  backOffMs,
  maxWaitMs,
  now = Date.now,
  delay = sleep,
}: {
  /** Minimum time between requests, per lane (e.g. "slow" and "fast" endpoints). */
  spacingMs: Record<string, number>;
  /** How long to stop calling after a 429. */
  backOffMs: number;
  /** Refuse rather than hold a request in the queue longer than this. */
  maxWaitMs: number;
  now?: () => number;
  delay?: (ms: number) => Promise<unknown>;
}) {
  const nextSlot = new Map<string, number>();
  let pausedUntil = 0;

  return {
    /** Resolves when it's this request's turn; rejects during a back-off or when the queue is too long. */
    async wait(lane: string): Promise<void> {
      const time = now();
      if (time < pausedUntil) {
        throw new ThrottledError(`paused ${Math.ceil((pausedUntil - time) / 1000)}s after a rate-limit warning`);
      }
      const slot = Math.max(time, nextSlot.get(lane) ?? 0);
      if (slot - time > maxWaitMs) throw new ThrottledError("too many lookups queued");
      nextSlot.set(lane, slot + (spacingMs[lane] ?? 0));
      if (slot > time) await delay(slot - time);
    },
    /** Call after an HTTP 429: every lane waits out the back-off. */
    backOff(): void {
      pausedUntil = now() + backOffMs;
    },
  };
}
