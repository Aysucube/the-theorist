import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, fixture } from "./__fixtures__/load";
import { findCombos, parseFindMyCombos, type RawFindMyCombos } from "./spellbook";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const atraxa = () => JSON.parse(fixture("spellbook/find-my-combos-atraxa.json")) as RawFindMyCombos;

describe("parseFindMyCombos", () => {
  it("reads the combos a deck has, with pieces, results and steps", () => {
    const { included } = parseFindMyCombos(atraxa());
    expect(included.length).toBeGreaterThan(0);
    const monolith = included.find((c) => c.cards.includes("Basalt Monolith"))!;
    expect(monolith.cards).toEqual(expect.arrayContaining(["Rings of Brighthearth", "Basalt Monolith"]));
    expect(monolith.results).toContain("Infinite colorless mana");
    expect(monolith.steps).toMatch(/Basalt Monolith/);
    expect(monolith.url).toBe(`https://commanderspellbook.com/combo/${monolith.id}/`);
  });

  it("keeps the most played one-card-away combos, most played first", () => {
    const { almostIncluded } = parseFindMyCombos(atraxa());
    expect(almostIncluded.length).toBeGreaterThan(0);
    expect(almostIncluded.length).toBeLessThanOrEqual(30);
    const popularity = almostIncluded.map((c) => c.popularity ?? 0);
    expect(popularity).toEqual([...popularity].sort((a, b) => b - a));
  });

  it("copes with an empty answer", () => {
    expect(parseFindMyCombos({})).toEqual({ included: [], almostIncluded: [] });
  });
});

describe("findCombos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the commander and the rest of the deck", async () => {
    const { fetch, calls } = fakeFetch({ "https://backend.commanderspellbook.com/find-my-combos": fixture("spellbook/find-my-combos-atraxa.json") });
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return fetch(url, init);
    });

    const combos = await findCombos(["Atraxa, Praetors' Voice"], ["Basalt Monolith", "Rings of Brighthearth"]);
    expect(combos.included.length).toBeGreaterThan(0);
    expect(sent[0]).toEqual({
      commanders: [{ card: "Atraxa, Praetors' Voice" }],
      main: [{ card: "Basalt Monolith" }, { card: "Rings of Brighthearth" }],
    });
    expect(calls[0].headers["user-agent"]).toMatch(/^TheTheorist\//);
  });

  it("reports a failed request", async () => {
    vi.stubGlobal("fetch", fakeFetch({ "https://backend.commanderspellbook.com/find-my-combos": { status: 500 } }).fetch);
    await expect(findCombos(["X"], ["Y"])).rejects.toThrow(/Commander Spellbook: HTTP 500/);
  });
});
