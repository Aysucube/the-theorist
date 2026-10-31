// Cards with almost the same effect as a given card: the card page's "Similar
// cards" gallery (EDHREC's similar list, with each card's cheapest PH copy and
// artwork), and the Shopping page's alternatives to an expensive card.
import { fitsIdentity } from "@/lib/builder/plan";
import { isLandCard } from "@/lib/deck-beta/lands";
import { cardRoles } from "@/lib/deck-beta/roles";
import { getPriceSummary } from "@/lib/prices";
import { edhrecSlug } from "@/lib/slugs";
import { getCardStats } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { findCard, getCardDetails } from "@/lib/sources/scryfall";
import type { AlternativesResponse, CardDetails, ListingBrief, ScryfallCard, TcgphSummary } from "@/lib/types";

export interface SimilarCard {
  name: string;
  imageUrl?: string;
  cheapest?: ListingBrief;
  stores: number;
  /** TCGph couldn't be reached, so a missing price means "unknown". */
  priceUnavailable?: boolean;
}

async function describe(name: string): Promise<SimilarCard> {
  let summary = null;
  let priceUnavailable: boolean | undefined;
  try {
    summary = await getPriceSummary(name);
  } catch (error) {
    reportSourceError("similar price", error);
    priceUnavailable = true;
  }
  // The cheapest printing's art comes with the price; otherwise ask Scryfall (cached, paced).
  const imageUrl = summary?.imageUrl ?? (await findCard(name).catch(() => null))?.card.imageUrl;
  return { name, imageUrl, cheapest: summary?.cheapest, stores: summary?.stores ?? 0, priceUnavailable };
}

/** EDHREC's similar cards for `card`, priced, in EDHREC's order. Empty if EDHREC has none. */
export async function getSimilarCards(card: ScryfallCard): Promise<SimilarCard[]> {
  const stats = await getCardStats(edhrecSlug(card.name, card.layout));
  const names = (stats?.similar ?? []).filter((name) => name !== card.name);
  return Promise.all(names.map(describe));
}

/** Cards priced for one card's alternatives: a full menu, without crowding TCGph. */
const MAX_ALTERNATIVES = 24;
const PRICES_AT_ONCE = 4;

/**
 * The cards that could stand in for `own`, closest first: EDHREC's similar
 * cards (`first`), then the cards similar to those (`second`, a wider net, so
 * only the ones that do the same job). All of them are castable wherever `own`
 * is, and a land only stands in for a land.
 */
export function alternativeCandidates(own: CardDetails, first: string[], second: string[], details: Record<string, CardDetails>): CardDetails[] {
  const roles = cardRoles(own);
  const sameJob = (card: CardDetails) => isLandCard(own) || [...cardRoles(card)].some((role) => roles.has(role));
  const known = (names: string[]) => names.flatMap((name) => details[name] ?? []);
  const seen = new Set([own.name]);
  return [...known(first), ...known(second).filter(sameJob)]
    .filter((card) => {
      if (seen.has(card.name) || isLandCard(card) !== isLandCard(own) || !fitsIdentity(card, own.colorIdentity)) return false;
      seen.add(card.name);
      return true;
    })
    .slice(0, MAX_ALTERNATIVES);
}

/** Cheaper cards to look at instead of `name`: everything in stock that could stand in for it, cheapest first. */
export async function getAlternatives(name: string): Promise<AlternativesResponse> {
  const card = (await findCard(name))?.card;
  if (!card) return { alternatives: [] };

  let incomplete = false;
  const giveUp = (where: string) => (error: unknown) => {
    reportSourceError(where, error);
    incomplete = true;
    return null;
  };

  const first = (await getCardStats(edhrecSlug(card.name, card.layout)))?.similar ?? [];
  const firstDetails = await getCardDetails(first);
  const wider = await Promise.all(Object.values(firstDetails).map((c) => getCardStats(edhrecSlug(c.name, c.layout)).catch(giveUp("alternatives decks"))));
  const second = wider.flatMap((stats) => stats?.similar ?? []);
  const details = await getCardDetails([card.name, ...first, ...second]);
  const own = details[card.name];
  if (!own) return { alternatives: [] };

  const candidates = alternativeCandidates(own, first, second, details);
  const priced: (TcgphSummary | null)[] = [];
  for (let i = 0; i < candidates.length; i += PRICES_AT_ONCE) {
    const batch = candidates.slice(i, i + PRICES_AT_ONCE);
    priced.push(...(await Promise.all(batch.map((c) => getPriceSummary(c.name).catch(giveUp("alternative price"))))));
  }

  const alternatives = candidates.flatMap((c, i) => {
    const summary = priced[i];
    return summary?.cheapest ? [{ name: c.name, typeLine: c.typeLine, manaCost: c.manaCost, price: { found: true as const, ...summary } }] : [];
  });
  alternatives.sort((a, b) => a.price.cheapest!.pricePhp - b.price.cheapest!.pricePhp);
  return { alternatives, incomplete: incomplete || undefined };
}
