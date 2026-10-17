import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, fixture } from "./__fixtures__/load";
import { AUTOCOMPLETE_LIMIT, rankSuggestions, suggestCardNames } from "./scryfall";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const AUTOCOMPLETE = "https://api.scryfall.com/cards/autocomplete";
const atra = () => fixture("scryfall/autocomplete-atra.json");
const atraNames = () => (JSON.parse(atra()) as { data: string[] }).data;

describe("rankSuggestions", () => {
  it("puts names starting with the query first, then word matches, then loose matches", () => {
    const ranked = rankSuggestions(["Heat Ray", "Ixhel, Scion of Atraxa", "Atraxa, Praetors' Voice"], "atra");
    expect(ranked).toEqual(["Atraxa, Praetors' Voice", "Ixhel, Scion of Atraxa", "Heat Ray"]);
  });

  it("keeps Scryfall's order within each group and caps the list", () => {
    const ranked = rankSuggestions(atraNames(), "atra");
    expect(ranked).toHaveLength(AUTOCOMPLETE_LIMIT);

    const prefixed = atraNames().filter((n) => n.toLowerCase().startsWith("atra"));
    expect(ranked.slice(0, prefixed.length)).toEqual(prefixed);
    // Loose matches like "Heat Ray" fall behind real "Atra..." names.
    expect(ranked.indexOf("Ixhel, Scion of Atraxa")).toBeGreaterThan(-1);
    expect(ranked.indexOf("Heat Ray")).toBeGreaterThan(ranked.indexOf("Ixhel, Scion of Atraxa"));
  });

  it("ignores accents and case", () => {
    expect(rankSuggestions(["Oath of Lim-Dûl", "Lim-Dûl's Vault"], "LIM-DUL")).toEqual([
      "Lim-Dûl's Vault",
      "Oath of Lim-Dûl",
    ]);
  });
});

describe("suggestCardNames", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks Scryfall once per normalized query and returns ranked names", async () => {
    const { fetch, calls } = fakeFetch({ [`${AUTOCOMPLETE}?q=atra`]: atra() });
    vi.stubGlobal("fetch", fetch);

    const names = await suggestCardNames("  Atra ");

    expect(calls.map((c) => c.url)).toEqual([`${AUTOCOMPLETE}?q=atra`]);
    expect(calls[0].headers["user-agent"]).toMatch(/^CommanderPH\//);
    expect(names[0]).toMatch(/^Atra/);
    expect(names.length).toBeLessThanOrEqual(AUTOCOMPLETE_LIMIT);
  });

  it("doesn't call Scryfall for fewer than 2 characters", async () => {
    const { fetch, calls } = fakeFetch({});
    vi.stubGlobal("fetch", fetch);

    expect(await suggestCardNames("a")).toEqual([]);
    expect(await suggestCardNames("   ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("throws when Scryfall is down", async () => {
    const { fetch } = fakeFetch({ [`${AUTOCOMPLETE}?q=atra`]: { status: 503 } });
    vi.stubGlobal("fetch", fetch);
    await expect(suggestCardNames("atra")).rejects.toThrow("Scryfall: HTTP 503");
  });
});

// Keep last: it leaves this file's Scryfall client paused for 30 seconds.
describe("after Scryfall says 429", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stops calling Scryfall until the lockout passes", async () => {
    const { fetch, calls } = fakeFetch({ [`${AUTOCOMPLETE}?q=rate`]: { status: 429 } });
    vi.stubGlobal("fetch", fetch);

    await expect(suggestCardNames("rate")).rejects.toThrow("Scryfall: HTTP 429");
    // The next lookup is refused without contacting Scryfall at all.
    await expect(suggestCardNames("other")).rejects.toThrow(/paused 30s/);
    expect(calls).toHaveLength(1);
  });
});
