import { cacheLife } from "next/cache";
import { canBeCommander } from "@/lib/commander-rules";
import { fixingLandsQuery } from "@/lib/deck-beta/lands";
import type { RelatedLook, RelatedPart } from "@/lib/deck-beta/related";
import { printingVariants } from "@/lib/printings";
import type { CardDetails, CardInfo, Printing, Ruling, ScryfallCard, ScryfallLookup } from "@/lib/types";
import { SourceError, sourceFetch } from "./http";
import { createThrottle } from "./throttle";

// Official API: https://scryfall.com/docs/api
const API = "https://api.scryfall.com";

interface RawFace {
  name: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  /** Printed power and toughness ("6", "*"); missing on cards without a P/T box. */
  power?: string;
  toughness?: string;
  image_uris?: { normal?: string; small?: string; art_crop?: string };
}

interface RawCard extends RawFace {
  id: string;
  oracle_id?: string;
  layout: string;
  type_line: string;
  color_identity: string[];
  scryfall_uri: string;
  edhrec_rank?: number;
  prices: { usd?: string | null; usd_foil?: string | null };
  legalities: Record<string, string>;
  card_faces?: RawFace[];
  keywords?: string[];
  cmc?: number;
  /** On the Commander Game Changers list. */
  game_changer?: boolean;
  artist?: string;
  full_art?: boolean;
  border_color?: string;
  set_name?: string;
  /** What this card links to: tokens, emblems, meld partners... */
  all_parts?: { id: string; component: string; name: string; type_line: string }[];
}

// Scryfall's hard limits (https://scryfall.com/docs/api/rate-limits): 2 requests
// a second for search/named/random/collection, 10 a second for everything else.
// A 429 locks the caller out for 30 seconds, and ignoring 429s can get an app
// banned, so after one we stop calling entirely until the lockout has passed.
const SLOW_ENDPOINT = /^\/cards\/(search|named|random|collection)\b/;
const throttle = createThrottle({
  spacingMs: { slow: 500, fast: 100 },
  backOffMs: 30_000,
  maxWaitMs: 20_000,
});

async function get(path: string, json?: unknown): Promise<unknown | null> {
  try {
    await throttle.wait(SLOW_ENDPOINT.test(path) ? "slow" : "fast");
  } catch (e) {
    throw new SourceError("Scryfall", e instanceof Error ? e.message : "busy");
  }
  const res = await sourceFetch("Scryfall", `${API}${path}`, "application/json", json);
  if (res.status === 404) return null;
  if (res.status === 429) {
    throttle.backOff();
    throw new SourceError("Scryfall", "HTTP 429 (rate limited, pausing 30s)");
  }
  if (!res.ok) throw new SourceError("Scryfall", `HTTP ${res.status}`);
  return res.json();
}

function toCard(raw: RawCard): ScryfallCard {
  const front = raw.card_faces?.[0];
  const oracleText = raw.card_faces
    ? raw.card_faces.map((f) => f.oracle_text).filter(Boolean).join("\n—\n")
    : raw.oracle_text;
  const frontType = front?.type_line ?? raw.type_line;
  const frontText = front?.oracle_text ?? raw.oracle_text ?? "";
  const usd = raw.prices.usd ?? raw.prices.usd_foil;

  return {
    id: raw.id,
    oracleId: raw.oracle_id,
    name: raw.name,
    layout: raw.layout,
    typeLine: raw.type_line,
    manaCost: raw.mana_cost || front?.mana_cost || undefined,
    oracleText,
    colorIdentity: raw.color_identity,
    imageUrl: raw.image_uris?.normal ?? front?.image_uris?.normal,
    artUrl: raw.image_uris?.art_crop ?? front?.image_uris?.art_crop,
    scryfallUrl: raw.scryfall_uri,
    edhrecRank: raw.edhrec_rank,
    priceUsd: usd ? Number(usd) : undefined,
    commanderLegal: raw.legalities.commander === "legal",
    gameChanger: raw.game_changer || undefined,
    canBeCommander: canBeCommander({
      typeLine: frontType,
      power: front?.power ?? raw.power,
      toughness: front?.toughness ?? raw.toughness,
      oracleText: frontText,
    }),
  };
}

/**
 * Puts the card the user most likely meant first: "esika" should find
 * "Esika, God of the Tree" before the more popular "Inga and Esika".
 * Ties keep Scryfall's EDHREC-popularity order (the sort is stable).
 */
function rankByName(cards: RawCard[], query: string) {
  const q = query.toLowerCase();
  const score = (name: string) => {
    const n = name.toLowerCase();
    if (n.split(/,| \/\/ /)[0].trim() === q) return 0;
    if (n.startsWith(q)) return 1;
    return 2;
  };
  return [...cards].sort((a, b) => score(a.name) - score(b.name));
}

/**
 * Resolves a typed name to one card. Tries Scryfall's fuzzy name match first;
 * if that is ambiguous ("atraxa"), falls back to a full-text search ordered by
 * EDHREC popularity and returns the other matches as alternatives.
 */
export async function findCard(query: string): Promise<ScryfallLookup | null> {
  "use cache: remote";
  cacheLife("days");

  const q = encodeURIComponent(query);
  const exact = (await get(`/cards/named?fuzzy=${q}`)) as RawCard | null;
  if (exact) return { card: toCard(exact), alternatives: [] };

  const search = (await get(
    `/cards/search?q=${q}&order=edhrec&unique=cards`,
  )) as { data: RawCard[] } | null;
  if (!search?.data.length) return null;

  const [first, ...rest] = rankByName(search.data, query);
  return {
    card: toCard(first),
    alternatives: rest.slice(0, 8).map((c) => c.name),
  };
}

// --- Autocomplete -------------------------------------------------------------

/** Scryfall ignores queries shorter than this. */
export const AUTOCOMPLETE_MIN_LENGTH = 2;
export const AUTOCOMPLETE_LIMIT = 8;

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Scryfall's autocomplete matches loosely ("atra" also returns "Heat Ray"), so
 * names that start with the query come first, then names with a word that
 * starts with it, then the rest. Ties keep Scryfall's order.
 */
export function rankSuggestions(names: string[], query: string, limit = AUTOCOMPLETE_LIMIT) {
  const q = fold(query.trim());
  const score = (name: string) => {
    const n = fold(name);
    if (n.startsWith(q)) return 0;
    if (n.split(/[\s,\-/]+/).some((word) => word.startsWith(q))) return 1;
    return 2;
  };
  return [...names].sort((a, b) => score(a) - score(b)).slice(0, limit);
}

async function fetchSuggestions(query: string): Promise<string[]> {
  "use cache: remote";
  cacheLife("days");

  const catalog = (await get(`/cards/autocomplete?q=${encodeURIComponent(query)}`)) as {
    data?: string[];
  } | null;
  return rankSuggestions(catalog?.data ?? [], query);
}

/** Card names starting with (or close to) what the user has typed so far. */
export async function suggestCardNames(input: string): Promise<string[]> {
  // Normalize before the cached call so "Atra" and "atra " share one cache entry.
  const query = input.trim().toLowerCase().slice(0, 100);
  if (query.length < AUTOCOMPLETE_MIN_LENGTH) return [];
  return fetchSuggestions(query);
}

// --- Printings ----------------------------------------------------------------

interface RawPrinting {
  set: string;
  set_name: string;
  collector_number: string;
  released_at: string;
  rarity: string;
  finishes: string[];
  digital?: boolean;
  scryfall_uri: string;
  image_uris?: { small?: string; normal?: string };
  card_faces?: RawFace[];
  frame?: string;
  frame_effects?: string[];
  border_color?: string;
  full_art?: boolean;
  promo?: boolean;
  promo_types?: string[];
  set_type?: string;
  textless?: boolean;
}

interface RawList<T> {
  data: T[];
  has_more?: boolean;
  next_page?: string;
}

/** Scryfall returns 175 printings a page; basic lands need about six pages. */
const MAX_PRINTING_PAGES = 8;

function toPrinting(raw: RawPrinting): Printing {
  return {
    setCode: raw.set.toUpperCase(),
    setName: raw.set_name,
    collectorNumber: raw.collector_number,
    releasedAt: raw.released_at,
    rarity: raw.rarity,
    finishes: raw.finishes,
    imageUrl: raw.image_uris?.small ?? raw.card_faces?.[0]?.image_uris?.small,
    largeImageUrl: raw.image_uris?.normal ?? raw.card_faces?.[0]?.image_uris?.normal,
    variants: printingVariants({
      frame: raw.frame,
      frameEffects: raw.frame_effects,
      borderColor: raw.border_color,
      fullArt: raw.full_art,
      promo: raw.promo,
      promoTypes: raw.promo_types,
      setType: raw.set_type,
      finishes: raw.finishes,
      textless: raw.textless,
    }),
    scryfallUrl: raw.scryfall_uri,
  };
}

/** Every paper printing of a card, newest first. */
export async function getPrintings(oracleId: string): Promise<Printing[]> {
  "use cache: remote";
  cacheLife("days");

  const printings: Printing[] = [];
  const query = encodeURIComponent(`oracleid:${oracleId} game:paper`);
  let path: string | null = `/cards/search?q=${query}&unique=prints&order=released`;

  for (let page = 0; path && page < MAX_PRINTING_PAGES; page++) {
    const list = (await get(path)) as RawList<RawPrinting> | null;
    if (!list) break;
    printings.push(...list.data.filter((p) => !p.digital).map(toPrinting));
    path = list.has_more && list.next_page?.startsWith(API) ? list.next_page.slice(API.length) : null;
  }
  return printings;
}

// --- Daily bulk file ----------------------------------------------------------

/**
 * Where to download Scryfall's daily file of every card (one printing each,
 * with today's prices), and when it was made. Scryfall asks apps that need
 * many cards to use these files instead of thousands of API calls.
 */
export async function getOracleCardsFile(): Promise<{ updatedAt: string; url: string }> {
  const info = (await get("/bulk-data/oracle-cards")) as { updated_at?: string; jsonl_download_uri?: string } | null;
  if (!info?.updated_at || !info.jsonl_download_uri) throw new SourceError("Scryfall", "no daily card file listed");
  return { updatedAt: info.updated_at, url: info.jsonl_download_uri };
}

// --- Rulings ------------------------------------------------------------------

interface RawRuling {
  source: string;
  published_at: string;
  comment: string;
}

/**
 * A card's rulings, oldest first: Wizards of the Coast's official rulings (the
 * ones Gatherer and play sites show) plus any notes from Scryfall. Every
 * printing of a card has the same rulings, so any printing's id works.
 */
export async function getRulings(cardId: string): Promise<Ruling[]> {
  "use cache: remote";
  cacheLife("days");

  const list = (await get(`/cards/${encodeURIComponent(cardId)}/rulings`)) as RawList<RawRuling> | null;
  return (list?.data ?? []).map((r) => ({
    source: r.source === "wotc" ? "wotc" : "scryfall",
    publishedAt: r.published_at,
    comment: r.comment,
  }));
}

// --- Card info in bulk --------------------------------------------------------

/** Scryfall's /cards/collection takes up to 75 cards per request. */
const COLLECTION_SIZE = 75;

const nameKey = (name: string) => name.trim().toLowerCase();

function toCardInfo(card: RawCard): CardInfo {
  const full = toCard(card);
  return {
    name: card.name,
    typeLine: card.type_line,
    manaCost: full.manaCost,
    colorIdentity: card.color_identity,
    imageUrl: full.imageUrl,
  };
}

/**
 * Type line, mana cost, colors and image for many cards at once, keyed by the name as
 * given. Uses Scryfall's bulk lookup (2 requests for a 100-card deck instead
 * of 100). Names Scryfall doesn't know are left out; for split cards, which it
 * only finds by their first half, the first half is tried too.
 */
export async function getCardInfo(names: string[]): Promise<Record<string, CardInfo>> {
  "use cache: remote";
  cacheLife("days");

  return mapValues(await collectCards(names), toCardInfo);
}

/** Like getCardInfo, plus the rules text and keywords the deck beta reads to find synergies. */
export async function getCardDetails(names: string[]): Promise<Record<string, CardDetails>> {
  "use cache: remote";
  cacheLife("days");

  return mapValues(await collectCards(names), toCardDetails);
}

function toCardDetails(card: RawCard): CardDetails {
  const front = card.card_faces?.[0];
  return {
    ...toCardInfo(card),
    layout: card.layout,
    oracleText: toCard(card).oracleText ?? "",
    keywords: card.keywords ?? [],
    cmc: card.cmc ?? 0,
    power: front?.power ?? card.power,
    toughness: front?.toughness ?? card.toughness,
    canBeCommander: toCard(card).canBeCommander,
  };
}

// --- Land artwork ---------------------------------------------------------------

export interface LandArt {
  artUrl: string;
  artist?: string;
  set?: string;
  /** Printed as a full-art or borderless card, so the art covers the whole card. */
  fullArt: boolean;
}

/** Every distinct artwork of a land (one search page is plenty), newest first. */
export async function getLandArts(name: string): Promise<LandArt[]> {
  "use cache: remote";
  cacheLife("days");

  const query = encodeURIComponent(`!"${name}" unique:art game:paper`);
  const list = (await get(`/cards/search?q=${query}&order=released&dir=desc`)) as RawList<RawCard> | null;
  return (list?.data ?? []).flatMap((card) => {
    const artUrl = card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop;
    if (!artUrl) return [];
    return [{ artUrl, artist: card.artist, set: card.set_name, fullArt: Boolean(card.full_art) || card.border_color === "borderless" }];
  });
}

// --- Tokens and related cards ----------------------------------------------------

/** What Scryfall links to each card, by the name asked for, with a double-faced card's other side as a "back". */
export async function getRelatedParts(names: string[]): Promise<Record<string, RelatedPart[]>> {
  "use cache: remote";
  cacheLife("days");

  return mapValues(await collectCards(names), (card) => {
    const parts: RelatedPart[] = (card.all_parts ?? []).map((p) => ({ id: p.id, component: p.component, name: p.name, typeLine: p.type_line }));
    const back = card.card_faces?.[1];
    if ((card.layout === "transform" || card.layout === "modal_dfc") && back) {
      parts.push({ component: "back", name: back.name, typeLine: back.type_line ?? "", imageUrl: back.image_uris?.normal, transforms: card.layout === "transform" });
    }
    return parts;
  });
}

/** How tokens and emblems look, by Scryfall id. */
export async function getRelatedLooks(ids: string[]): Promise<Record<string, RelatedLook>> {
  "use cache: remote";
  cacheLife("days");

  const looks: Record<string, RelatedLook> = {};
  for (let i = 0; i < ids.length; i += COLLECTION_SIZE) {
    const batch = ids.slice(i, i + COLLECTION_SIZE);
    const list = (await get("/cards/collection", { identifiers: batch.map((id) => ({ id })) })) as { data: RawCard[] } | null;
    for (const card of list?.data ?? []) {
      const front = card.card_faces?.[0];
      looks[card.id] = {
        imageUrl: card.image_uris?.normal ?? front?.image_uris?.normal,
        text: card.oracle_text ?? front?.oracle_text,
        power: card.power ?? front?.power,
        toughness: card.toughness ?? front?.toughness,
      };
    }
  }
  return looks;
}

// --- Fixing lands ---------------------------------------------------------------

/** The lands that fix these colors, most played in Commander first. One page is plenty: the rest are hardly played. */
export async function getFixingLands(colors: string[]): Promise<CardDetails[]> {
  "use cache: remote";
  cacheLife("days");

  const query = encodeURIComponent(fixingLandsQuery(colors));
  const list = (await get(`/cards/search?q=${query}&order=edhrec&unique=cards`)) as RawList<RawCard> | null;
  return (list?.data ?? []).map(toCardDetails);
}

// --- Game Changers --------------------------------------------------------------

/** The list is about 50 cards: one page of search results, with room to grow. */
const MAX_GAME_CHANGER_PAGES = 3;

/**
 * The cards on Wizards of the Coast's Commander Game Changers list, which the
 * brackets limit (none in Brackets 1–2, up to three in Bracket 3), as Scryfall
 * marks them. It changes a few times a year, so a day's cache is plenty.
 */
/** Every set's full name by its code ("PTK" → "Portal Three Kingdoms"), from one request, cached for days. */
export async function getSetNames(): Promise<Record<string, string>> {
  "use cache: remote";
  cacheLife("days");

  const list = (await get("/sets")) as RawList<{ code: string; name: string }> | null;
  return Object.fromEntries((list?.data ?? []).map((set) => [set.code.toUpperCase(), set.name]));
}

export async function getGameChangers(): Promise<CardDetails[]> {
  "use cache: remote";
  cacheLife("days");

  const cards: CardDetails[] = [];
  let path: string | null = `/cards/search?q=${encodeURIComponent("is:gamechanger")}&unique=cards&order=name`;
  for (let page = 0; path && page < MAX_GAME_CHANGER_PAGES; page++) {
    const list = (await get(path)) as RawList<RawCard> | null;
    if (!list) break;
    cards.push(...list.data.map(toCardDetails));
    path = list.has_more && list.next_page?.startsWith(API) ? list.next_page.slice(API.length) : null;
  }
  return cards;
}

function mapValues<A, B>(record: Record<string, A>, fn: (value: A) => B): Record<string, B> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]));
}

/** Scryfall's cards for many names, keyed by every spelling asked for. */
async function collectCards(names: string[]): Promise<Record<string, RawCard>> {
  // Found cards by lower-cased name; each distinct card is asked about once (first spelling wins).
  const byKey: Record<string, RawCard> = {};
  const firstSpelling = new Map<string, string>();
  for (const n of names) if (n.trim() && !firstSpelling.has(nameKey(n))) firstSpelling.set(nameKey(n), n.trim());
  const unique = [...firstSpelling.values()];

  async function lookup(batch: { asked: string; query: string }[]) {
    const list = (await get("/cards/collection", { identifiers: batch.map((b) => ({ name: b.query })) })) as {
      data: RawCard[];
      not_found?: { name?: string }[];
    } | null;
    if (!list) return [];
    // Cards come back in the order asked, minus the ones not found.
    const missing = new Set((list.not_found ?? []).map((n) => nameKey(n.name ?? "")));
    const found = batch.filter((b) => !missing.has(nameKey(b.query)));
    found.forEach((b, i) => {
      const card = list.data[i];
      if (card) byKey[nameKey(b.asked)] = card;
    });
    return batch.filter((b) => missing.has(nameKey(b.query)));
  }

  const notFound: { asked: string; query: string }[] = [];
  for (let i = 0; i < unique.length; i += COLLECTION_SIZE) {
    notFound.push(...(await lookup(unique.slice(i, i + COLLECTION_SIZE).map((n) => ({ asked: n, query: n })))));
  }
  const splitCards = notFound.filter((b) => b.query.includes(" // ")).map((b) => ({ asked: b.asked, query: b.query.split(" // ")[0] }));
  for (let i = 0; i < splitCards.length; i += COLLECTION_SIZE) {
    await lookup(splitCards.slice(i, i + COLLECTION_SIZE));
  }

  // Answer every spelling that was asked for.
  const result: Record<string, RawCard> = {};
  for (const n of names) {
    const info = byKey[nameKey(n)];
    if (info) result[n] = info;
  }
  return result;
}
