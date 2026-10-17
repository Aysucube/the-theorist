/**
 * Runs `worker` on every item with at most `limit` running at once. Once
 * `signal` aborts, no new items start (running ones finish or abort themselves).
 */
export async function forEachLimited<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !signal?.aborted) {
      await worker(items[next++]);
    }
  });
  await Promise.all(lanes);
}
