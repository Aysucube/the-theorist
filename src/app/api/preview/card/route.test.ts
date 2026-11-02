import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/lib/sources/__fixtures__/load";
import { GET } from "./route";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const request = (name: string) => new NextRequest(`http://localhost/api/preview/card?name=${encodeURIComponent(name)}`);
const named = (name: string) => `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
const card = JSON.stringify({
  id: "test-id",
  name: "Sol Ring",
  layout: "normal",
  type_line: "Artifact",
  oracle_text: "{T}: Add {C}{C}.",
  mana_cost: "{1}",
  color_identity: [],
  image_uris: { normal: "https://cards.scryfall.io/normal/front/a/b/sol-ring.jpg?1" },
  scryfall_uri: "https://scryfall.com/card/test",
  prices: { usd: "1.00" },
  legalities: { commander: "legal" },
});

describe("GET /api/preview/card", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("answers from Scryfall alone, without touching the price sites", async () => {
    const { fetch, calls } = fakeFetch({ [named("Sol Ring")]: card });
    vi.stubGlobal("fetch", fetch);

    const res = await GET(request("Sol Ring"));

    expect(await res.json()).toMatchObject({ name: "Sol Ring", imageUrl: "https://cards.scryfall.io/normal/front/a/b/sol-ring.jpg?1", typeLine: "Artifact", manaCost: "{1}" });
    expect(res.headers.get("cache-control")).toContain("max-age=");
    expect(calls.map((c) => c.url)).toEqual([named("Sol Ring")]);
  });

  it("rejects a missing name", async () => {
    expect((await GET(request(" "))).status).toBe(400);
  });

  it("has nothing to say about a card Scryfall doesn't know", async () => {
    const { fetch } = fakeFetch({});
    vi.stubGlobal("fetch", fetch);
    const res = await GET(request("Zzz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it("reports Scryfall being down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fakeFetch({ [named("Down Card")]: { status: 503 } }).fetch);
    expect((await GET(request("Down Card"))).status).toBe(502);
  });
});
