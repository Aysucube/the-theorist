import { cacheLife } from "next/cache";
import type { ScryfallCard, ScryfallLookup } from "@/lib/types";
import { SourceError, USER_AGENT } from "./http";

// Official API: https://scryfall.com/docs/api
const API = "https://api.scryfall.com";

interface RawFace {
  name: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  image_uris?: { normal?: string };
}

interface RawCard extends RawFace {
  id: string;
  layout: string;
  type_line: string;
  color_identity: string[];
  scryfall_uri: string;
  edhrec_rank?: number;
  prices: { usd?: string | null; usd_foil?: string | null };
  legalities: Record<string, string>;
  card_faces?: RawFace[];
}

async function get(path: string): Promise<unknown | null> {
  const res = await fetch(`${API}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (res.status === 404) return null;
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
    name: raw.name,
    layout: raw.layout,
    typeLine: raw.type_line,
    manaCost: raw.mana_cost || front?.mana_cost || undefined,
    oracleText,
    colorIdentity: raw.color_identity,
    imageUrl: raw.image_uris?.normal ?? front?.image_uris?.normal,
    scryfallUrl: raw.scryfall_uri,
    edhrecRank: raw.edhrec_rank,
    priceUsd: usd ? Number(usd) : undefined,
    commanderLegal: raw.legalities.commander === "legal",
    canBeCommander:
      (/\bLegendary\b/.test(frontType) && /\bCreature\b/.test(frontType)) ||
      /can be your commander/i.test(frontText),
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
  "use cache";
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
