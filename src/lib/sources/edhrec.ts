import { cacheLife } from "next/cache";
import type {
  EdhrecCardList,
  EdhrecCardRef,
  EdhrecCardStats,
  EdhrecCommanderStats,
} from "@/lib/types";
import { SourceError, USER_AGENT } from "./http";

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

interface RawPage {
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

async function getPage(path: string): Promise<RawPage | null> {
  const res = await fetch(`${JSON_BASE}/${path}.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  // EDHREC answers 403 (not 404) for slugs it doesn't know.
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new SourceError("EDHREC", `HTTP ${res.status}`);
  const page = (await res.json()) as RawPage;
  // Some unknown slugs come back as an empty page instead of an error.
  return page.container?.json_dict?.card?.name ? page : null;
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

/** How often a card is played overall, and by which commanders. */
export async function getCardStats(slug: string): Promise<EdhrecCardStats | null> {
  "use cache";
  cacheLife("days");

  const page = await getPage(`cards/${slug}`);
  const dict = page?.container?.json_dict;
  if (!dict?.card) return null;

  const numDecks = dict.card.num_decks ?? 0;
  const potentialDecks = dict.card.potential_decks ?? 0;
  const topCommanders =
    dict.cardlists?.find((l) => l.tag === "topcommanders")?.cardviews ?? [];

  return {
    url: `${SITE}/cards/${slug}`,
    numDecks,
    potentialDecks,
    inclusion: potentialDecks ? numDecks / potentialDecks : 0,
    salt: dict.card.salt,
    topCommanders: topCommanders.map(toRef),
  };
}

/** Recommendations for decks led by this card. Null if it isn't a commander on EDHREC. */
export async function getCommanderStats(
  slug: string,
): Promise<EdhrecCommanderStats | null> {
  "use cache";
  cacheLife("days");

  const page = await getPage(`commanders/${slug}`);
  const dict = page?.container?.json_dict;
  if (!dict?.card) return null;

  // "New Cards" leads EDHREC's list but is the least useful for deckbuilding; move it last.
  const lists: EdhrecCardList[] = (dict.cardlists ?? [])
    .filter((l) => l.cardviews.length > 0)
    .sort((a, b) => Number(a.tag === "newcards") - Number(b.tag === "newcards"))
    .map((l) => ({ header: l.header, cards: l.cardviews.map(toRef) }));

  return {
    url: `${SITE}/commanders/${slug}`,
    numDecks: dict.card.num_decks ?? 0,
    rank: dict.card.rank,
    lists,
  };
}
