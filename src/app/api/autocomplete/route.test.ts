import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, fixture } from "@/lib/sources/__fixtures__/load";
import { GET } from "./route";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const SCRYFALL = "https://api.scryfall.com/cards/autocomplete?q=atra";
const request = (q: string) =>
  new NextRequest(`http://localhost/api/autocomplete?q=${encodeURIComponent(q)}`);

describe("GET /api/autocomplete", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns suggested names with a browser cache header", async () => {
    vi.stubGlobal("fetch", fakeFetch({ [SCRYFALL]: fixture("scryfall/autocomplete-atra.json") }).fetch);

    const res = await GET(request("atra"));
    const body = (await res.json()) as { names: string[] };

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=");
    expect(body.names[0]).toMatch(/^Atra/);
  });

  it("returns an empty list for a too-short query", async () => {
    const res = await GET(request("a"));
    expect(await res.json()).toEqual({ names: [] });
  });

  it("answers 502 with an empty list when Scryfall fails", async () => {
    vi.stubGlobal("fetch", fakeFetch({ [SCRYFALL]: { status: 500 } }).fetch);

    const res = await GET(request("atra"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ names: [] });
  });
});
