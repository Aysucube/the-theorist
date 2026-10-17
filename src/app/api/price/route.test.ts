import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, fixture } from "@/lib/sources/__fixtures__/load";
import type { PriceResponse } from "@/lib/types";
import { GET } from "./route";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const request = (name?: string) =>
  new NextRequest(
    name === undefined
      ? "http://localhost/api/price"
      : `http://localhost/api/price?name=${encodeURIComponent(name)}`,
  );

const SOL_RING_TCGPH = "https://tcgph.com/card/sol-ring";

describe("GET /api/price", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the cheapest price with a browser cache header", async () => {
    // Scryfall isn't served here (404s), so the name is used as given.
    vi.stubGlobal(
      "fetch",
      fakeFetch({ [SOL_RING_TCGPH]: fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html") }).fetch,
    );

    const res = await GET(request("Sol Ring"));
    const body = (await res.json()) as PriceResponse;

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=");
    expect(body.found).toBe(true);
    if (body.found) {
      expect(body.cheapest?.pricePhp).toBeGreaterThan(0);
      expect(body.url).toBe(SOL_RING_TCGPH);
    }
  });

  it("says found: false for a card TCGph doesn't list", async () => {
    vi.stubGlobal("fetch", fakeFetch({ [SOL_RING_TCGPH]: fixture("tcgph/unknown-card.html") }).fetch);

    const res = await GET(request("Sol Ring"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false });
  });

  it("rejects a missing or overly long name", async () => {
    expect((await GET(request())).status).toBe(400);
    expect((await GET(request("   "))).status).toBe(400);
    expect((await GET(request("x".repeat(151)))).status).toBe(400);
  });

  it("answers 502 when TCGph is down", async () => {
    vi.stubGlobal("fetch", fakeFetch({ [SOL_RING_TCGPH]: { status: 503 } }).fetch);
    expect((await GET(request("Sol Ring"))).status).toBe(502);
  });
});
