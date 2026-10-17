import { cacheLife } from "next/cache";
import type {
  EdhrecCardList,
  EdhrecCardRef,
  EdhrecCardStats,
  EdhrecCommanderStats,
} from "@/lib/types";
import { SourceError, sourceFetch } from "./http";

// EDHREC has no official API. These are the JSON files its own pages load,
// so we request one per search and cache the result for a day.
const JSON_BASE = "https://json.edhrec.com/pages";
const SITE = "https://edhrec.com";

interface RawCardView {
  name: string;
  num_decks?: number;
  potential_decks?: number;
  synergy?: number;
}

export interface RawPage {
  /** Set instead of data when EDHREC sends a name to its canonical page, e.g. "/cards/fire-ice". */
  redirect?: string;
  container?: {
    json_dict?: {
      card?: {
        name?: string;
        num_decks?: number;
        potential_decks?: number;
        rank?: number;
        salt?: number;
      };
      cardlists?: { header: string; tag: string; cardviews: RawCardView[] }[];
    };
  };
}

function toRef(view: RawCardView): EdhrecCardRef {
  const numDecks = view.num_decks ?? 0;
  return {
    name: view.name,
    numDecks,
    potentialDecks: view.potential_decks,
    inclusion: view.potential_decks ? numDecks / view.potential_decks : undefined,
    synergy: view.synergy,
  };
}

/** `path` is the page's path under /pages, e.g. "cards/sol-ring". */
export function parseCardStats(page: RawPage, path: string): EdhrecCardStats | null {
  const dict = page.container?.json_dict;
  if (!dict?.card?.name) return null;

  const numDecks = dict.card.num_decks ?? 0;
  const potentialDecks = dict.card.potential_decks ?? 0;
  const topCommanders =
    dict.cardlists?.find((l) => l.tag === "topcommanders")?.cardviews ?? [];

  return {
    url: `${SITE}/${path}`,
    numDecks,
    potentialDecks,
    inclusion: potentialDecks ? numDecks / potentialDecks : 0,
    salt: dict.card.salt,
    topCommanders: topCommanders.map(toRef),
  };
}

/** `path` is the page's path under /pages, e.g. "commanders/atraxa-praetors-voice". */
export function parseCommanderStats(page: RawPage, path: string): EdhrecCommanderStats | null {
  const dict = page.container?.json_dict;
  if (!dict?.card?.name) return null;

  // "New Cards" leads EDHREC's list but is the least useful for deckbuilding; move it last.
  const lists: EdhrecCardList[] = (dict.cardlists ?? [])
    .filter((l) => l.cardviews.length > 0)
    .sort((a, b) => Number(a.tag === "newcards") - Number(b.tag === "newcards"))
    .map((l) => ({ header: l.header, cards: l.cardviews.map(toRef) }));

  return {
    url: `${SITE}/${path}`,
    numDecks: dict.card.num_decks ?? 0,
    rank: dict.card.rank,
    lists,
  };
}

/**
 * Fetches a page, following one EDHREC redirect. Returns the page with the
 * path it was finally read from, or null if EDHREC doesn't know the slug.
 */
async function getPage(
  path: string,
  redirectsLeft = 1,
): Promise<{ page: RawPage; path: string } | null> {
  const res = await sourceFetch("EDHREC", `${JSON_BASE}/${path}.json`, "application/json");
  // EDHREC answers 403 (not 404) for slugs it doesn't know.
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new SourceError("EDHREC", `HTTP ${res.status}`);

  const page = (await res.json()) as RawPage;
  if (page.redirect) {
    return redirectsLeft > 0 ? getPage(page.redirect.replace(/^\//, ""), redirectsLeft - 1) : null;
  }
  return { page, path };
}

/** How often a card is played overall, and by which commanders. */
export async function getCardStats(slug: string): Promise<EdhrecCardStats | null> {
  "use cache: remote";
  cacheLife("days");

  const result = await getPage(`cards/${slug}`);
  return result && parseCardStats(result.page, result.path);
}

/** Recommendations for decks led by this card. Null if it isn't a commander on EDHREC. */
export async function getCommanderStats(
  slug: string,
): Promise<EdhrecCommanderStats | null> {
  "use cache: remote";
  cacheLife("days");

  const result = await getPage(`commanders/${slug}`);
  return result && parseCommanderStats(result.page, result.path);
}
