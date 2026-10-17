import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, fixture } from "@/lib/sources/__fixtures__/load";
import type { CardPreview } from "@/lib/types";
import { GET } from "./route";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const request = (name: string) =>
  new NextRequest(`http://localhost/api/preview?name=${encodeURIComponent(name)}`);

describe("GET /api/preview", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the artwork, cheapest price and shop", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch({ "https://tcgph.com/card/sol-ring": fixture("tcgph/esika-god-of-the-tree-the-prismatic-bridge.html") }).fetch,
    );

    const res = await GET(request("Sol Ring"));
    const body = (await res.json()) as CardPreview;

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=");
    expect(body).toMatchObject({ name: "Sol Ring", imageUrl: expect.stringMatching(/^https:/) });
    expect(body.cheapest?.pricePhp).toBeGreaterThan(0);
  });

  it("rejects a missing name", async () => {
    expect((await GET(request(" "))).status).toBe(400);
  });

  it("answers 502 when TCGph is down", async () => {
    vi.stubGlobal("fetch", fakeFetch({ "https://tcgph.com/card/sol-ring": { status: 503 } }).fetch);
    expect((await GET(request("Sol Ring"))).status).toBe(502);
  });
});
