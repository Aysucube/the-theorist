import type { AnalysisResponse } from "@/lib/deck-beta/api";
import { mergeEdhrecCombos, missingPieces } from "@/lib/deck-beta/combos";
import { cardKey } from "@/lib/deck-beta/recommend";
import { MAX_DECK_CARDS } from "@/lib/deck";
import { getCommanderCombos, getCommanderStats } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { getCardDetails } from "@/lib/sources/scryfall";
import { estimateBracket, findCombos, getCombo } from "@/lib/sources/spellbook";
import { edhrecSlug } from "@/lib/slugs";
import type { Combo, EdhrecCombo, EdhrecCommanderStats } from "@/lib/types";

const isName = (n: unknown): n is string => typeof n === "string" && n.trim().length > 0 && n.length <= 150;

/** EDHREC combos Commander Spellbook didn't return that get Spellbook's steps (one request each, cached a week). */
const EXTRA_DETAILS = 20;
/** One-card-away combos whose missing card gets details (to show and add it). */
const MISSING_DETAILS = 60;

/** Runs `fn` on every item, a few at a time. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// POST /api/deck-beta/analysis { commander: "Lathril, Blade of the Elves", layout: "normal", cards: ["Elvish Archdruid", ...] }
// Deck Synergy: the deck's combos and bracket estimate (Commander Spellbook, plus the combos EDHREC
// lists for the commander) and its commander's playstyles (EDHREC).
export async function POST(request: Request) {
  let body: { commander?: unknown; layout?: unknown; cards?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Answered as a bad request below.
  }
  const { commander, layout, cards } = body;
  if (!isName(commander) || !Array.isArray(cards) || cards.length > MAX_DECK_CARDS || !cards.every(isName)) {
    return Response.json({ error: `Send { commander, cards: [...] } with up to ${MAX_DECK_CARDS} card names.` }, { status: 400 });
  }

  // Sorted, so the same deck hits the cache whatever order it was pasted in.
  const main = [...new Set(cards.filter((c) => cardKey(c) !== cardKey(commander)))].sort();
  const slug = edhrecSlug(commander, typeof layout === "string" ? layout : "normal");
  const [spellbook, bracket, stats, edhrecCombos] = await Promise.all([
    findCombos([commander], main).catch((error) => {
      reportSourceError("api/deck-beta/analysis", error);
      return null;
    }),
    estimateBracket([commander], main).catch((error) => {
      reportSourceError("api/deck-beta/analysis", error);
      return null;
    }),
    getCommanderStats(slug).catch((error): EdhrecCommanderStats | null => {
      reportSourceError("api/deck-beta/analysis", error);
      return null;
    }),
    getCommanderCombos(slug).catch((error): EdhrecCombo[] | null => {
      reportSourceError("api/deck-beta/analysis", error);
      return null;
    }),
  ]);

  // EDHREC's combos for the commander that Spellbook's search didn't return
  // (often two or more cards away), with Spellbook's steps for the first few.
  const known = new Set([...(spellbook?.included ?? []), ...(spellbook?.almostIncluded ?? [])].map((c) => c.id));
  const extraIds = (edhrecCombos ?? []).filter((c) => !known.has(c.id)).slice(0, EXTRA_DETAILS).map((c) => c.id);
  const extra = await inBatches(extraIds, 4, (id) =>
    getCombo(id).catch((error): Combo | null => {
      reportSourceError("api/deck-beta/analysis", error);
      return null;
    }),
  );
  const details = Object.fromEntries(extra.flatMap((c, i) => (c ? [[extraIds[i], c]] : [])));
  const combos = spellbook || edhrecCombos ? mergeEdhrecCombos(spellbook, edhrecCombos ?? [], [commander, ...main], details) : null;

  // Cards the combos a card or two away need, with details so the page can show and add them.
  const deck = [commander, ...main];
  const missingNames = [
    ...new Set([...(combos?.almostIncluded ?? []).slice(0, MISSING_DETAILS), ...(combos?.wider ?? [])].flatMap((c) => missingPieces(c, deck))),
  ];
  const missing = missingNames.length > 0 ? await getCardDetails(missingNames).catch(() => ({})) : {};

  const response: AnalysisResponse = {
    combos,
    bracket,
    themes: stats?.themes?.slice(0, 16) ?? [],
    commanderUrl: stats?.url,
    missing,
  };
  return Response.json(response);
}
