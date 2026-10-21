import { cacheLife } from "next/cache";
import type { Combo, DeckCombos } from "@/lib/types";
import { SourceError, sourceFetch } from "./http";

// Commander Spellbook (https://commanderspellbook.com) is the community
// database of Commander combos, behind the combo lists on EDHREC and Moxfield.
// Its open API (https://backend.commanderspellbook.com/schema/swagger/) says
// which combos a deck contains and which it's one card away from. One request
// per deck analysis, cached for a day.
const API = "https://backend.commanderspellbook.com";
const SITE = "https://commanderspellbook.com";
/** The API works through every combo in a 100-card deck, which can take a while. */
const TIMEOUT_MS = 45_000;
/** "One card away" lists run to hundreds for big decks; keep the most played. */
const MAX_ALMOST = 30;

interface RawVariant {
  id: string;
  uses?: { card?: { name?: string } }[];
  requires?: { template?: { name?: string } }[];
  produces?: { feature?: { name?: string } }[];
  description?: string;
  easyPrerequisites?: string;
  notablePrerequisites?: string;
  manaNeeded?: string;
  popularity?: number | null;
}

export interface RawFindMyCombos {
  results?: { included?: RawVariant[]; almostIncluded?: RawVariant[] };
}

function toCombo(raw: RawVariant): Combo {
  const names = <T>(items: T[] | undefined, pick: (item: T) => string | undefined) =>
    (items ?? []).map(pick).filter((n): n is string => Boolean(n));
  return {
    id: raw.id,
    cards: names(raw.uses, (u) => u.card?.name),
    templates: names(raw.requires, (r) => r.template?.name),
    results: names(raw.produces, (p) => p.feature?.name),
    steps: raw.description?.trim() ?? "",
    prerequisites: [raw.easyPrerequisites, raw.notablePrerequisites].filter(Boolean).join("\n").trim(),
    manaNeeded: raw.manaNeeded || undefined,
    popularity: raw.popularity ?? undefined,
    url: `${SITE}/combo/${encodeURIComponent(raw.id)}/`,
  };
}

const byPopularity = (a: Combo, b: Combo) => (b.popularity ?? 0) - (a.popularity ?? 0);

export function parseFindMyCombos(body: RawFindMyCombos): DeckCombos {
  return {
    included: (body.results?.included ?? []).map(toCombo).sort(byPopularity),
    almostIncluded: (body.results?.almostIncluded ?? []).map(toCombo).sort(byPopularity).slice(0, MAX_ALMOST),
  };
}

/**
 * The combos a deck has, and the ones it's one card away from. Pass names in a
 * stable order (e.g. sorted) so the same deck hits the cache.
 */
export async function findCombos(commanders: string[], main: string[]): Promise<DeckCombos> {
  "use cache: remote";
  cacheLife("days");

  const res = await sourceFetch(
    "Commander Spellbook",
    `${API}/find-my-combos`,
    "application/json",
    { commanders: commanders.map((card) => ({ card })), main: main.map((card) => ({ card })) },
    TIMEOUT_MS,
  );
  if (!res.ok) throw new SourceError("Commander Spellbook", `HTTP ${res.status}`);
  return parseFindMyCombos((await res.json()) as RawFindMyCombos);
}
