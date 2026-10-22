import type { AnalysisResponse } from "@/lib/deck-beta/api";
import { cardKey } from "@/lib/deck-beta/recommend";
import { MAX_DECK_CARDS } from "@/lib/deck";
import { getCommanderStats } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { getCardDetails } from "@/lib/sources/scryfall";
import { estimateBracket, findCombos } from "@/lib/sources/spellbook";
import { edhrecSlug } from "@/lib/slugs";
import type { EdhrecCommanderStats } from "@/lib/types";

const isName = (n: unknown): n is string => typeof n === "string" && n.trim().length > 0 && n.length <= 150;

// POST /api/deck-beta/analysis { commander: "Lathril, Blade of the Elves", layout: "normal", cards: ["Elvish Archdruid", ...] }
// Deck Synergy: the deck's combos and bracket estimate (Commander Spellbook) and its commander's playstyles (EDHREC).
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
  const [combos, bracket, stats] = await Promise.all([
    findCombos([commander], main).catch((error) => {
      reportSourceError("api/deck-beta/analysis", error);
      return null;
    }),
    estimateBracket([commander], main).catch((error) => {
      reportSourceError("api/deck-beta/analysis", error);
      return null;
    }),
    getCommanderStats(edhrecSlug(commander, typeof layout === "string" ? layout : "normal")).catch(
      (error): EdhrecCommanderStats | null => {
        reportSourceError("api/deck-beta/analysis", error);
        return null;
      },
    ),
  ]);

  // Cards the one-card-away combos need, with details so the page can show and add them.
  const inDeck = new Set([commander, ...main].map(cardKey));
  const missingNames = [
    ...new Set((combos?.almostIncluded ?? []).flatMap((c) => c.cards).filter((n) => !inDeck.has(cardKey(n)))),
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
