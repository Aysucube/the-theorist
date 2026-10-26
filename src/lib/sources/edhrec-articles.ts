// EDHREC's articles about a commander (deck techs, budget builds, upgrade
// guides), from the search on its articles site (WordPress). They're listed
// with EDHREC's own short summaries and links, as further reading on how the
// commander is played. One search per commander, cached for days.
import { cacheLife } from "next/cache";
import { sourceFetch } from "./http";

const SEARCH = "https://edhrec.com/articles/wp-json/wp/v2/posts";
const SHOWN = 4;

export interface EdhrecArticle {
  title: string;
  url: string;
  /** EDHREC's one-line summary of the article. */
  excerpt: string;
  /** "2026-07-21" */
  date: string;
}

interface RawPost {
  date?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" };

/** HTML as plain text: tags out, entities decoded, spaces tidied. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** A commander's short name as articles use it: "Lathril, Blade of the Elves" → "Lathril". */
export function shortName(commander: string): string {
  return commander.split(" // ")[0].split(",")[0].trim();
}

/**
 * The search results that are about the commander (its name in the title or
 * summary), the ones named in the title first, up to four.
 */
export function parseArticles(json: unknown, commander: string): EdhrecArticle[] {
  if (!Array.isArray(json)) return [];
  const name = shortName(commander).toLowerCase();
  return (json as RawPost[])
    .flatMap((post) => {
      const title = plainText(post.title?.rendered ?? "");
      const excerpt = plainText(post.excerpt?.rendered ?? "");
      const url = post.link ?? "";
      if (!title || !/^https:\/\/edhrec\.com\/articles\//.test(url)) return [];
      if (!`${title} ${excerpt}`.toLowerCase().includes(name)) return [];
      return [{ title, url, excerpt, date: (post.date ?? "").slice(0, 10), inTitle: title.toLowerCase().includes(name) }];
    })
    .sort((a, b) => Number(b.inTitle) - Number(a.inTitle))
    .slice(0, SHOWN)
    .map(({ title, url, excerpt, date }) => ({ title, url, excerpt, date }));
}

export async function getCommanderArticles(commander: string): Promise<EdhrecArticle[]> {
  "use cache: remote";
  cacheLife("days");

  const params = new URLSearchParams({ search: shortName(commander), per_page: "12", _fields: "title,link,excerpt,date" });
  const res = await sourceFetch("EDHREC", `${SEARCH}?${params}`, "application/json");
  if (!res.ok) return [];
  return parseArticles(await res.json(), commander);
}
