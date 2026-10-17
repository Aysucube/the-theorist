import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, fixture } from "./__fixtures__/load";
import { AUTOCOMPLETE_LIMIT, getPrintings, rankSuggestions, suggestCardNames } from "./scryfall";

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

describe("getPrintings", () => {
  afterEach(() => vi.unstubAllGlobals());

  const API = "https://api.scryfall.com";
  const first = `${API}/cards/search?q=${encodeURIComponent("oracleid:abc game:paper")}&unique=prints&order=released`;
  const raw = (set: string, n: string, digital = false) => ({
    set, set_name: `Set ${set}`, collector_number: n, released_at: "2024-01-01", rarity: "uncommon",
    finishes: ["nonfoil"], digital, scryfall_uri: `https://scryfall.com/card/${set}/${n}`,
    image_uris: { small: `https://cards.scryfall.io/small/${set}-${n}.jpg` },
  });

  it("follows Scryfall's next pages and skips online-only printings", async () => {
    const { fetch, calls } = fakeFetch({
      [first]: JSON.stringify({ data: [raw("cmm", "410"), raw("prm", "1", true)], has_more: true, next_page: `${API}/cards/search?page=2&x=1` }),
      [`${API}/cards/search?page=2&x=1`]: JSON.stringify({ data: [raw("c21", "263")], has_more: false }),
    });
    vi.stubGlobal("fetch", fetch);

    const printings = await getPrintings("abc");

    expect(calls.map((c) => c.url)).toEqual([first, `${API}/cards/search?page=2&x=1`]);
    expect(printings.map((p) => `${p.setCode} #${p.collectorNumber}`)).toEqual(["CMM #410", "C21 #263"]);
    expect(printings[0]).toMatchObject({ setName: "Set cmm", imageUrl: "https://cards.scryfall.io/small/cmm-410.jpg" });
  });

  it("reads Sol Ring's real printing list", async () => {
    vi.stubGlobal("fetch", fakeFetch({ [first]: fixture("scryfall/prints-sol-ring.json") }).fetch);
    const printings = await getPrintings("abc");
    expect(printings.length).toBeGreaterThan(100);
    for (const p of printings) {
      expect(p.setCode).toMatch(/^[A-Z0-9]{2,6}$/);
      expect(p.collectorNumber).not.toBe("");
      expect(p.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
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
