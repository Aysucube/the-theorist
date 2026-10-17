import { describe, expect, it } from "vitest";
import { lookupPrice, RETRY_WAITS_MS, sleep } from "./price-lookup";
import type { PriceResponse } from "./types";

const found: PriceResponse = { found: true, url: "https://tcgph.com/card/x", stores: 1, listings: 1, byStore: [] };

/** A fetch that answers with each response in turn, plus the waits the lookup asked for. */
function scripted(...responses: (Response | Error)[]) {
  const waits: number[] = [];
  let calls = 0;
  const fetchFn = (async () => {
    const next = responses[Math.min(calls++, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next.clone();
  }) as unknown as typeof fetch;
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  return { fetchFn, wait, waits, calls: () => calls };
}

const ok = () => Response.json(found);
const status = (code: number, headers?: Record<string, string>) => new Response("", { status: code, headers });

describe("lookupPrice", () => {
  it("returns the price on the first try when all is well", async () => {
    const s = scripted(ok());
    expect(await lookupPrice("Sol Ring", s)).toEqual(found);
    expect(s.waits).toEqual([]);
  });

  it("waits longer after each failure and gets the price eventually", async () => {
    const s = scripted(status(502), status(502), status(502), ok());
    const reasons: string[] = [];

    const result = await lookupPrice("Sol Ring", { ...s, onWait: (_, reason) => reasons.push(reason) });

    expect(result).toEqual(found);
    expect(s.waits).toEqual(RETRY_WAITS_MS.slice(0, 3));
    expect(reasons).toEqual(Array(3).fill("a price source is busy"));
  });

  it("retries after network errors too", async () => {
    const s = scripted(new TypeError("Failed to fetch"), ok());
    expect(await lookupPrice("Sol Ring", s)).toEqual(found);
    expect(s.waits).toEqual([RETRY_WAITS_MS[0]]);
  });

  it("gives up only after every retry has failed", async () => {
    const s = scripted(status(502));
    expect(await lookupPrice("Sol Ring", s)).toBe("error");
    expect(s.calls()).toBe(RETRY_WAITS_MS.length + 1);
  });

  it("waits out the app's own rate limit without spending a retry", async () => {
    const s = scripted(status(429, { "Retry-After": "42" }), status(429, { "Retry-After": "7" }), ok());
    expect(await lookupPrice("Sol Ring", s)).toEqual(found);
    expect(s.waits).toEqual([42_000, 7_000]);
  });

  it("doesn't retry a rejected name", async () => {
    const s = scripted(status(400));
    expect(await lookupPrice("", s)).toBe("error");
    expect(s.calls()).toBe(1);
  });
});

describe("sleep", () => {
  it("stops early when the signal aborts", async () => {
    const controller = new AbortController();
    const pending = sleep(60_000, controller.signal);
    controller.abort(new Error("left the page"));
    await expect(pending).rejects.toThrow("left the page");
  });
});
