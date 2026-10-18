import { afterEach, describe, expect, it, vi } from "vitest";
import type { PriceResponse } from "./types";

const found = (name: string): PriceResponse => ({
  found: true,
  url: `https://tcgph.com/card/${name}`,
  stores: 1,
  listings: 1,
  byStore: [],
});

/** A fetch for /api/price that records the order of names asked and how many run at once. */
function stubPriceApi({ fail = new Set<string>() } = {}) {
  const asked: string[] = [];
  let running = 0;
  let peak = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    const name = new URL(url, "http://localhost").searchParams.get("name")!;
    asked.push(name);
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    // A 400 isn't retried, which keeps failure tests fast.
    return fail.has(name) ? new Response("", { status: 400 }) : Response.json(found(name));
  });
  return { asked, peak: () => peak };
}

/** Fresh module state per test (the queue is module-level). */
async function freshQueue() {
  vi.resetModules();
  return import("./price-queue");
}

async function settle(getPriceState: (n: string) => { status: string }, names: string[]) {
  for (let i = 0; i < 200 && names.some((n) => getPriceState(n).status !== "done"); i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("price queue", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks a whole list one card at a time, in order", async () => {
    const api = stubPriceApi();
    const { checkPrices, getPriceState } = await freshQueue();

    checkPrices(["A", "B", "C"]);
    expect(getPriceState("C").status).toBe("queued");
    await settle(getPriceState, ["A", "B", "C"]);

    expect(api.asked).toEqual(["A", "B", "C"]);
    expect(api.peak()).toBe(1);
    expect(getPriceState("B")).toEqual({ status: "done", result: found("B") });
  });

  it("doesn't ask twice for a card already checked or queued", async () => {
    const api = stubPriceApi();
    const { checkPrices, getPriceState } = await freshQueue();

    checkPrices(["A", "B"]);
    checkPrices(["B", "A"]);
    await settle(getPriceState, ["A", "B"]);
    checkPrices(["A"]);
    await new Promise((r) => setTimeout(r, 50));

    expect(api.asked).toEqual(["A", "B"]);
  });

  it("puts a single click ahead of a long list", async () => {
    const api = stubPriceApi();
    const { checkPrices, getPriceState } = await freshQueue();

    checkPrices(["A", "B", "C"]);
    checkPrices(["Z"], { first: true });
    await settle(getPriceState, ["A", "B", "C", "Z"]);

    // A was already being fetched; Z jumps ahead of B and C.
    expect(api.asked).toEqual(["A", "Z", "B", "C"]);
  });

  it("tries a failed card again when asked again", async () => {
    const api = stubPriceApi({ fail: new Set(["A"]) });
    const { checkPrices, getPriceState } = await freshQueue();

    checkPrices(["A"]);
    await settle(getPriceState, ["A"]);
    expect(getPriceState("A")).toEqual({ status: "done", result: "error" });

    checkPrices(["A"]);
    await settle(getPriceState, ["A"]);
    expect(api.asked).toEqual(["A", "A"]);
  });
});
