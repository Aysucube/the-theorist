import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, fixture } from "./__fixtures__/load";
import {
  getCardStats,
  getCommanderStats,
  getTheme,
  parseCardPairings,
  parseCardStats,
  parseCommanderStats,
  parseThemeList,
  parseThemePage,
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

describe("similar cards", () => {
  it("reads EDHREC's list of cards with a similar role", () => {
    const stats = parseCardStats(solRing(), "cards/sol-ring")!;
    expect(stats.similar.length).toBeGreaterThan(0);
    expect(stats.similar.every((name) => typeof name === "string" && name.length > 0)).toBe(true);
  });
});

describe("parseCardPairings", () => {
  it("reads the cards played alongside a card, strongest pairing first, without the commander lists", () => {
    const result = parseCardPairings(solRing(), "cards/sol-ring")!;

    expect(result.url).toBe("https://edhrec.com/cards/sol-ring");
    expect(result.pairings.length).toBeGreaterThan(50);
    const lifts = result.pairings.map((p) => p.lift);
    expect(lifts).toEqual([...lifts].sort((a, b) => b - a));
    // Each card once, even when EDHREC lists it twice (e.g. in "Top Cards" and "Creatures").
    expect(new Set(result.pairings.map((p) => p.name)).size).toBe(result.pairings.length);

    expect(result.pairings.every((p) => p.list !== "Top Commanders" && p.list !== "New Commanders")).toBe(true);
    expect(result.similar.length).toBeGreaterThan(0);
  });

  it("returns null for a page without a card", () => {
    expect(parseCardPairings({}, "cards/x")).toBeNull();
  });
});

describe("deck themes", () => {
  const themes = () => JSON.parse(fixture("edhrec/tags.json")) as RawPage;
  const tokens = () => JSON.parse(fixture("edhrec/tags-tokens.json")) as RawPage;

  it("reads EDHREC's list of themes, most popular first", () => {
    const list = parseThemeList(themes());
    expect(list.length).toBeGreaterThan(100);
    expect(list.map((t) => t.slug)).toContain("tokens");
    for (const t of list) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.name).not.toBe("");
    }
    const counts = list.map((t) => t.numDecks);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("reads a theme's commanders and recommended cards, without the commander lists among the cards", () => {
    const page = parseThemePage(tokens(), "tokens")!;
    expect(page).toMatchObject({ name: "Tokens", url: "https://edhrec.com/tags/tokens" });
    expect(page.numDecks).toBeGreaterThan(0);
    expect(page.commanders.length).toBeGreaterThan(5);
    for (const c of page.commanders) expect(c.numDecks).toBeGreaterThan(0);

    const headers = page.lists.map((l) => l.header);
    expect(headers).not.toContain("Top Commanders");
    expect(headers).not.toContain("New Commanders");
    expect(headers.at(-1)).toBe("New Cards");
    expect(page.lists[0].cards[0].synergy).toBeTypeOf("number");
  });

  it("asks EDHREC only for theme names that look like slugs", async () => {
    const { fetch, calls } = fakeFetch({});
    vi.stubGlobal("fetch", fetch);
    expect(await getTheme("../cards/sol-ring")).toBeNull();
    expect(calls).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
