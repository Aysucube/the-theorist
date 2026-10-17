import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, fixture } from "./__fixtures__/load";
import {
  getCardStats,
  getCommanderStats,
  parseCardStats,
  parseCommanderStats,
  type RawPage,
} from "./edhrec";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const JSON_BASE = "https://json.edhrec.com/pages";
const solRing = () => JSON.parse(fixture("edhrec/cards-sol-ring.json")) as RawPage;
const atraxa = () => JSON.parse(fixture("edhrec/commanders-atraxa-praetors-voice.json")) as RawPage;

// These checks describe the JSON's shape, not today's numbers, so they keep
// passing after `npm run fixtures:update` unless EDHREC changes its format.
describe("parseCardStats", () => {
  it("reads how often a card is played and by which commanders", () => {
    const stats = parseCardStats(solRing(), "cards/sol-ring")!;

    expect(stats.url).toBe("https://edhrec.com/cards/sol-ring");
    expect(stats.numDecks).toBeGreaterThan(0);
    expect(stats.potentialDecks).toBeGreaterThanOrEqual(stats.numDecks);
    expect(stats.inclusion).toBeCloseTo(stats.numDecks / stats.potentialDecks);
    expect(stats.salt).toBeTypeOf("number");

    expect(stats.topCommanders.length).toBeGreaterThan(0);
    for (const c of stats.topCommanders) {
      expect(c.name).not.toBe("");
      expect(c.numDecks).toBeGreaterThan(0);
      expect(c.inclusion).toBeGreaterThan(0);
      expect(c.inclusion).toBeLessThanOrEqual(1);
    }
  });

  it("returns null for a page without a card", () => {
    expect(parseCardStats({}, "cards/x")).toBeNull();
    expect(parseCardStats({ container: { json_dict: { card: { name: "" } } } }, "cards/x")).toBeNull();
  });
});

describe("parseCommanderStats", () => {
  it("reads the commander's deck count and recommendation lists", () => {
    const stats = parseCommanderStats(atraxa(), "commanders/atraxa-praetors-voice")!;

    expect(stats.url).toBe("https://edhrec.com/commanders/atraxa-praetors-voice");
    expect(stats.numDecks).toBeGreaterThan(0);
    expect(stats.lists.length).toBeGreaterThan(0);

    for (const list of stats.lists) {
      expect(list.header).not.toBe("");
      expect(list.cards.length).toBeGreaterThan(0);
      for (const card of list.cards) {
        expect(card.name).not.toBe("");
        expect(card.inclusion).toBeGreaterThanOrEqual(0);
        expect(card.inclusion).toBeLessThanOrEqual(1);
        expect(card.synergy).toBeGreaterThanOrEqual(-1);
        expect(card.synergy).toBeLessThanOrEqual(1);
      }
    }
  });

  it("puts EDHREC's New Cards list last", () => {
    const headers = parseCommanderStats(atraxa(), "commanders/atraxa-praetors-voice")!.lists.map(
      (l) => l.header,
    );
    expect(headers).toContain("New Cards");
    expect(headers.at(-1)).toBe("New Cards");
  });
});

describe("getCardStats / getCommanderStats", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows EDHREC's redirect to the card's full page", async () => {
    // The saved redirect points "fire" at "/cards/fire-ice"; Sol Ring's page stands in for the target.
    const redirect = fixture("edhrec/cards-redirect.json");
    const target = (JSON.parse(redirect) as RawPage).redirect!;
    const { fetch, calls } = fakeFetch({
      [`${JSON_BASE}/cards/fire.json`]: redirect,
      [`${JSON_BASE}${target}.json`]: fixture("edhrec/cards-sol-ring.json"),
    });
    vi.stubGlobal("fetch", fetch);

    const stats = await getCardStats("fire");

    expect(calls.map((c) => c.url)).toEqual([`${JSON_BASE}/cards/fire.json`, `${JSON_BASE}${target}.json`]);
    expect(stats?.url).toBe(`https://edhrec.com${target}`);
  });

  it("gives up on a redirect loop instead of following it forever", async () => {
    const loop = JSON.stringify({ redirect: "/cards/a" });
    const { fetch, calls } = fakeFetch({
      [`${JSON_BASE}/cards/a.json`]: loop,
    });
    vi.stubGlobal("fetch", fetch);

    expect(await getCardStats("a")).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("returns null when EDHREC doesn't know the card (it answers 403)", async () => {
    const { fetch } = fakeFetch({ [`${JSON_BASE}/commanders/sol-ring.json`]: { status: 403 } });
    vi.stubGlobal("fetch", fetch);
    expect(await getCommanderStats("sol-ring")).toBeNull();
  });

  it("throws when EDHREC is down, so the page can say so", async () => {
    const { fetch } = fakeFetch({ [`${JSON_BASE}/cards/sol-ring.json`]: { status: 500 } });
    vi.stubGlobal("fetch", fetch);
    await expect(getCardStats("sol-ring")).rejects.toThrow("EDHREC: HTTP 500");
  });
});
