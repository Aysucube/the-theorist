import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const post = (body: unknown) =>
  new Request("http://localhost/api/cards/info", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/cards/info", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns type and cost per card name", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        data: [{ id: "x", name: "Sol Ring", layout: "normal", type_line: "Artifact", mana_cost: "{1}", color_identity: [], scryfall_uri: "", prices: {}, legalities: {} }],
        not_found: [],
      }),
    );
    const res = await POST(post({ names: ["Sol Ring"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cards: { "Sol Ring": { name: "Sol Ring", typeLine: "Artifact", manaCost: "{1}", colorIdentity: [] } } });
  });

  it("rejects bad requests", async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post({ names: [] }))).status).toBe(400);
    expect((await POST(post({ names: [42] }))).status).toBe(400);
    expect((await POST(post({ names: Array(151).fill("x") }))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/cards/info", { method: "POST", body: "not json" }))).status).toBe(400);
  });
});
