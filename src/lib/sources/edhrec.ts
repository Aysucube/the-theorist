import { cacheLife } from "next/cache";
import type {
  EdhrecCardPairings,
  EdhrecPairing,
  EdhrecCardList,
  EdhrecCardRef,
  EdhrecCardStats,
  EdhrecCombo,
  EdhrecCommanderStats,
  EdhrecDeckAverages,
  EdhrecTheme,
  EdhrecThemePage,
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
  /** The card's (or theme's) path on EDHREC, e.g. "/tags/tokens". */
  url?: string;
  /** On card pages: how many times more often it's played with that card than overall. */
  lift?: number;
}

export interface RawPage {
  /** The page's title, e.g. a theme's name. */
  header?: string;
  /** On commander pages: what its average deck holds. */
  land?: number;
  basic?: number;
  nonbasic?: number;
  creature?: number;
  instant?: number;
  sorcery?: number;
  artifact?: number;
  enchantment?: number;
  planeswalker?: number;
  battle?: number;
  bracket_counts?: Record<string, number>;
  /** Set instead of data when EDHREC sends a name to its canonical page, e.g. "/cards/fire-ice". */
  redirect?: string;
  /** Names of cards EDHREC considers similar (e.g. other mana rocks for Sol Ring). */
  similar?: unknown[];
  /** On commander pages: the playstyles (themes) its decks are built around, most decks first. */
  panels?: {
    taglinks?: { value?: string; slug?: string; count?: number }[];
    /** On commander pages: its average deck's spells by mana value, e.g. { "1": 8, "2": 18 }. */
    mana_curve?: Record<string, number>;
  };
  container?: {
    json_dict?: {
      card?: {
        name?: string;
        num_decks?: number;
        potential_decks?: number;
        rank?: number;
        salt?: number;
      };
      cardlists?: {
        header: string;
        tag: string;
        cardviews: RawCardView[];
        /** On combo pages: the combo the list is about. */
        href?: string;
        combo?: { comboId?: string; count?: number; results?: string[] };
      }[];
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
    similar: (page.similar ?? []).filter((name): name is string => typeof name === "string"),
  };
}

/**
 * The cards EDHREC lists as played alongside a card (its "Creatures",
 * "Instants", ... lists), strongest pairing first. Commanders lists are left
 * out: they say who plays the card, not what goes with it.
 */
export function parseCardPairings(page: RawPage, path: string): EdhrecCardPairings | null {
  const dict = page.container?.json_dict;
  if (!dict?.card?.name) return null;

  const best = new Map<string, EdhrecPairing>();
  for (const list of dict.cardlists ?? []) {
    for (const view of list.cardviews) {
      if (typeof view.lift !== "number" || !view.name) continue;
      const pairing: EdhrecPairing = {
        name: view.name,
        list: list.header,
        lift: view.lift,
        inclusion: view.potential_decks ? (view.num_decks ?? 0) / view.potential_decks : undefined,
      };
      const seen = best.get(view.name);
      if (!seen || seen.lift < pairing.lift) best.set(view.name, pairing);
    }
  }

  return {
    url: `${SITE}/${path}`,
    pairings: [...best.values()].sort((a, b) => b.lift - a.lift),
    similar: (page.similar ?? []).filter((name): name is string => typeof name === "string"),
  };
}

// --- Deck themes ("tags") ------------------------------------------------------

/** The page for EDHREC's list of every theme, most popular first. */
export function parseThemeList(page: RawPage): EdhrecTheme[] {
  const views = page.container?.json_dict?.cardlists?.[0]?.cardviews ?? [];
  return views.flatMap((view) => {
    const slug = view.url?.match(/^\/tags\/([a-z0-9-]+)$/)?.[1];
    return slug ? [{ name: view.name, slug, numDecks: view.num_decks ?? 0 }] : [];
  });
}

/** One theme's page: the commanders most often built around it, and the cards those decks play. */
export function parseThemePage(page: RawPage, slug: string): EdhrecThemePage | null {
  const lists = page.container?.json_dict?.cardlists;
  if (!lists?.length) return null;

  const commanders = lists.find((l) => l.tag === "topcommanders")?.cardviews.map(toRef) ?? [];
  const cards: EdhrecCardList[] = lists
    .filter((l) => !l.tag.endsWith("commanders") && l.cardviews.length > 0)
    // "New Cards" says least about the theme; move it last.
    .sort((a, b) => Number(a.tag === "newcards") - Number(b.tag === "newcards"))
    .map((l) => ({ header: l.header, cards: l.cardviews.map(toRef) }));

  return {
    name: page.header ?? slug,
    url: `${SITE}/tags/${slug}`,
    // Each commander's potential decks is every deck with this theme.
    numDecks: commanders[0]?.potentialDecks ?? 0,
    commanders,
    lists: cards,
  };
}

/** Every deck theme EDHREC tracks ("Tokens", "Aristocrats", ...), most popular first. */
export async function getThemes(): Promise<EdhrecTheme[]> {
  "use cache: remote";
  cacheLife("days");

  const result = await getPage("tags");
  return result ? parseThemeList(result.page) : [];
}

/** A theme's top commanders and recommended cards. Null if EDHREC has no such theme. */
export async function getTheme(slug: string): Promise<EdhrecThemePage | null> {
  "use cache: remote";
  cacheLife("days");

  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const result = await getPage(`tags/${slug}`);
  return result && parseThemePage(result.page, slug);
}

/** EDHREC's name for each set of colors, in WUBRG order. */
const COLOR_PAGES: Record<string, string> = {
  "": "colorless",
  W: "mono-white",
  U: "mono-blue",
  B: "mono-black",
  R: "mono-red",
  G: "mono-green",
  WU: "azorius",
  UB: "dimir",
  BR: "rakdos",
  RG: "gruul",
  WG: "selesnya",
  WB: "orzhov",
  UR: "izzet",
  BG: "golgari",
  WR: "boros",
  UG: "simic",
  WUB: "esper",
  UBR: "grixis",
  BRG: "jund",
  WRG: "naya",
  WUG: "bant",
  WBG: "abzan",
  WUR: "jeskai",
  UBG: "sultai",
  WBR: "mardu",
  URG: "temur",
  WUBR: "yore-tiller",
  UBRG: "glint-eye",
  WBRG: "dune-brood",
  WURG: "ink-treader",
  WUBG: "witch-maw",
  WUBRG: "five-color",
};

/**
 * A theme across every deck of exactly these colors ("Tokens" in Golgari), or
 * across all colors if EDHREC has no such page. Its synergy compares those
 * decks with others of the same colors, so it shows what the theme itself asks for.
 */
export async function getThemeInColors(slug: string, colors: string[]): Promise<EdhrecThemePage | null> {
  "use cache: remote";
  cacheLife("days");

  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const page = COLOR_PAGES[[..."WUBRG"].filter((c) => colors.includes(c)).join("")];
  const result = (page && (await getPage(`tags/${slug}/${page}`))) || (await getPage(`tags/${slug}`));
  return result && parseThemePage(result.page, slug);
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

  const themes: EdhrecTheme[] = (page.panels?.taglinks ?? []).flatMap((t) =>
    t.value && t.slug && /^[a-z0-9-]+$/.test(t.slug) ? [{ name: t.value, slug: t.slug, numDecks: t.count ?? 0 }] : [],
  );

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const averages: EdhrecDeckAverages | undefined =
    typeof page.land === "number"
      ? {
          lands: num(page.land),
          basics: num(page.basic),
          nonbasics: num(page.nonbasic),
          creatures: num(page.creature),
          instants: num(page.instant),
          sorceries: num(page.sorcery),
          artifacts: num(page.artifact),
          enchantments: num(page.enchantment),
          planeswalkers: num(page.planeswalker),
          battles: num(page.battle),
        }
      : undefined;

  // The average deck's spells by mana value, and their average cost.
  const curve = Object.entries(page.panels?.mana_curve ?? {}).flatMap(([cmc, count]) =>
    /^\d+$/.test(cmc) && typeof count === "number" && count > 0 ? [{ cmc: Number(cmc), count }] : [],
  );
  const spells = curve.reduce((sum, c) => sum + c.count, 0);
  const curveAverage = spells > 0 ? curve.reduce((sum, c) => sum + c.cmc * c.count, 0) / spells : undefined;
  const curveCounts = spells > 0 ? [0, 0, 0, 0, 0, 0] : undefined;
  for (const { cmc, count } of curve) if (curveCounts) curveCounts[Math.min(5, Math.max(0, cmc - 1))] += count;

  return {
    url: `${SITE}/${path}`,
    numDecks: dict.card.num_decks ?? 0,
    rank: dict.card.rank,
    lists,
    themes,
    averages,
    bracketCounts: page.bracket_counts && typeof page.bracket_counts === "object" ? page.bracket_counts : undefined,
    curveAverage,
    curveCounts,
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

/** The combos on a commander's EDHREC combo page, in EDHREC's order. */
export function parseCommanderCombos(page: RawPage): EdhrecCombo[] {
  return (page.container?.json_dict?.cardlists ?? []).flatMap((list) => {
    const id = list.combo?.comboId;
    const cards = list.cardviews.map((c) => c.name).filter(Boolean);
    if (!id || cards.length === 0) return [];
    return [{ id, cards, results: list.combo?.results ?? [], decks: list.combo?.count ?? 0, url: `${SITE}${list.href ?? `/combos/${id}`}` }];
  });
}

/** The combos EDHREC lists for a commander (the "Combos" tab of its page); null if it has no page. */
export async function getCommanderCombos(slug: string): Promise<EdhrecCombo[] | null> {
  "use cache: remote";
  cacheLife("days");

  const result = await getPage(`combos/${slug}`);
  return result && parseCommanderCombos(result.page);
}

/** How often a card is played overall, and by which commanders. */
export async function getCardStats(slug: string): Promise<EdhrecCardStats | null> {
  "use cache: remote";
  cacheLife("days");

  const result = await getPage(`cards/${slug}`);
  return result && parseCardStats(result.page, result.path);
}

/** Cards often played with this one. Null if EDHREC doesn't know it. */
export async function getCardPairings(slug: string): Promise<EdhrecCardPairings | null> {
  "use cache: remote";
  cacheLife("days");

  const result = await getPage(`cards/${slug}`);
  return result && parseCardPairings(result.page, result.path);
}

/**
 * Recommendations for one playstyle of a commander, e.g. Atraxa's "Infect"
 * decks. Synergy here compares those decks with all decks. Null if EDHREC has
 * no such page.
 */
export async function getCommanderTheme(slug: string, themeSlug: string): Promise<EdhrecCommanderStats | null> {
  "use cache: remote";
  cacheLife("days");

  if (!/^[a-z0-9-]{1,80}$/.test(themeSlug)) return null;
  const result = await getPage(`commanders/${slug}/${themeSlug}`);
  return result && parseCommanderStats(result.page, result.path);
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
