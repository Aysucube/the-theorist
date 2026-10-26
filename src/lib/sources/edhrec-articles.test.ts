import { describe, expect, it } from "vitest";
import { fixture } from "./__fixtures__/load";
import { parseArticles, plainText, shortName } from "./edhrec-articles";

describe("EDHREC articles about a commander", () => {
  const results = JSON.parse(fixture("edhrec/articles-lathril.json")) as unknown;

  it("keeps the search results about the commander, the ones named in the title first", () => {
    const articles = parseArticles(results, "Lathril, Blade of the Elves");
    expect(articles.length).toBeGreaterThanOrEqual(2);
    expect(articles.length).toBeLessThanOrEqual(4);
    expect(articles[0].title).toMatch(/Lathril/);
    for (const a of articles) {
      expect(a.url).toMatch(/^https:\/\/edhrec\.com\/articles\//);
      expect(`${a.title} ${a.excerpt}`).toMatch(/Lathril/i);
      expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("finds nothing for a commander the results don't mention", () => {
    expect(parseArticles(results, "Zzyzx, the Unmentioned")).toEqual([]);
    expect(parseArticles({ error: true }, "Lathril")).toEqual([]);
  });

  it("turns HTML into plain text and shortens commander names", () => {
    expect(plainText("<p>Lathril&#8217;s Elves &amp; more&hellip;</p>\n")).toBe("Lathril’s Elves & more…");
    expect(shortName("Lathril, Blade of the Elves")).toBe("Lathril");
    expect(shortName("Esika, God of the Tree // The Prismatic Bridge")).toBe("Esika");
  });
});
