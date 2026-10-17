import { describe, expect, it } from "vitest";
import { forEachLimited } from "./concurrency";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("forEachLimited", () => {
  it("handles every item without exceeding the limit", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];

    await forEachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await tick();
      done.push(n);
      running--;
    });

    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("starts nothing new after the signal aborts", async () => {
    const controller = new AbortController();
    const started: number[] = [];

    await forEachLimited(
      [1, 2, 3, 4, 5],
      1,
      async (n) => {
        started.push(n);
        if (n === 2) controller.abort();
        await tick();
      },
      controller.signal,
    );

    expect(started).toEqual([1, 2]);
  });

  it("does nothing for an empty list", async () => {
    await expect(forEachLimited([], 3, async () => {})).resolves.toBeUndefined();
  });
});
