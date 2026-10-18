import { describe, expect, it } from "vitest";
import { attemptUrl, IMAGE_RETRY_WAITS_MS, loadImageWithRetry } from "./image-loader";

/** A loader that fails the first `failures` attempts, recording what it was asked for. */
function flaky(failures: number) {
  const asked: string[] = [];
  const waits: number[] = [];
  return {
    load: async (src: string) => {
      asked.push(src);
      return asked.length > failures;
    },
    wait: async (ms: number) => {
      waits.push(ms);
    },
    asked,
    waits,
  };
}

const URL = "https://cards.scryfall.io/normal/front/a/b/card.jpg";

describe("loadImageWithRetry", () => {
  it("returns the image straight away when it loads first time", async () => {
    const f = flaky(0);
    expect(await loadImageWithRetry(URL, f)).toBe(URL);
    expect(f.waits).toEqual([]);
  });

  it("waits longer between each retry and asks for a fresh copy each time", async () => {
    const f = flaky(3);
    const notes: number[] = [];

    const src = await loadImageWithRetry(URL, { ...f, onWait: (_, attempt) => notes.push(attempt) });

    expect(src).toBe(`${URL}?retry=3`);
    expect(f.asked).toEqual([URL, `${URL}?retry=1`, `${URL}?retry=2`, `${URL}?retry=3`]);
    expect(f.waits).toEqual(IMAGE_RETRY_WAITS_MS.slice(0, 3));
    expect(notes).toEqual([1, 2, 3]);
  });

  it("gives up only after every retry failed", async () => {
    const f = flaky(Infinity);
    expect(await loadImageWithRetry(URL, f)).toBeNull();
    expect(f.asked).toHaveLength(IMAGE_RETRY_WAITS_MS.length + 1);
  });
});

describe("attemptUrl", () => {
  it("adds a retry marker, keeping any existing query string", () => {
    expect(attemptUrl(URL, 0)).toBe(URL);
    expect(attemptUrl(`${URL}?1789644446`, 2)).toBe(`${URL}?1789644446&retry=2`);
  });
});

describe("subscribeImage", () => {
  it("shares one download's status with every subscriber", async () => {
    // jsdom-free check: stub the global Image so loads succeed after a tick.
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        if (value) setTimeout(() => this.onload?.(), 1);
      }
    }
    const original = globalThis.Image;
    (globalThis as { Image: unknown }).Image = FakeImage;
    try {
      const { subscribeImage, getImageStatus } = await import("./image-loader");
      const url = "https://cards.scryfall.io/normal/shared.jpg";
      let first = 0;
      let second = 0;
      const stopFirst = subscribeImage(url, () => first++);
      const stopSecond = subscribeImage(url, () => second++);
      await new Promise((r) => setTimeout(r, 20));

      expect(getImageStatus(url)).toEqual({ src: url });
      expect(first).toBeGreaterThan(0);
      expect(second).toBe(first);
      stopFirst();
      stopSecond();
    } finally {
      (globalThis as { Image: unknown }).Image = original;
    }
  });
});
