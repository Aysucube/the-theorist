import type { NextRequest } from "next/server";
import type { PlaystyleCard, PlaystyleResponse } from "@/lib/deck-beta/api";
import { getCommanderStats, getCommanderTheme } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { getCardDetails } from "@/lib/sources/scryfall";
import { edhrecSlug } from "@/lib/slugs";

/** Cards that get full details (images, colors, text) for one playstyle: one Scryfall request's worth. */
const DETAILED_THEME = 60;
/** For all the commander's decks: enough to read every card's job for the upgrade picks (three requests). */
const DETAILED_ALL = 225;

// GET /api/deck-beta/playstyle?commander=Atraxa%2C%20Praetors%27%20Voice&layout=normal&theme=infect
// Deck Synergy: the best cards for one of a commander's playstyles, per EDHREC. Without a theme,
// the commander's cards across all its decks (for the Recommendations tab), lands left out.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const commander = params.get("commander")?.trim() ?? "";
  const layout = params.get("layout")?.trim() || "normal";
  const theme = params.get("theme")?.trim() ?? "";
  if (!commander || commander.length > 150 || (theme && !/^[a-z0-9-]{1,80}$/.test(theme)) || layout.length > 40) {
    return Response.json({ error: "Give a commander (and optionally a playstyle)." }, { status: 400 });
  }

  try {
    const slug = edhrecSlug(commander, layout);
    const stats = theme ? await getCommanderTheme(slug, theme) : await getCommanderStats(slug);
    if (!stats) return Response.json({ found: false } satisfies PlaystyleResponse);

    // Each card once, with its best showing across EDHREC's lists.
    const best = new Map<string, PlaystyleCard>();
    for (const list of stats.lists) {
      if (!theme && /lands/i.test(list.header)) continue;
      for (const c of list.cards) {
        const seen = best.get(c.name);
        if (!seen || (seen.synergy ?? -1) < (c.synergy ?? -1)) {
          best.set(c.name, { name: c.name, synergy: c.synergy, inclusion: c.inclusion, numDecks: c.numDecks });
        }
      }
    }
    const cards = [...best.values()].sort(
      (a, b) => (b.synergy ?? -1) - (a.synergy ?? -1) || (b.inclusion ?? 0) - (a.inclusion ?? 0),
    );
    // For the whole commander, detail the most played and highest-synergy cards.
    const toDetail = theme
      ? cards.slice(0, DETAILED_THEME)
      : [...cards]
          .sort((a, b) => (b.inclusion ?? 0) + Math.max(0, b.synergy ?? 0) - ((a.inclusion ?? 0) + Math.max(0, a.synergy ?? 0)))
          .slice(0, DETAILED_ALL);
    const details = await getCardDetails(toDetail.map((c) => c.name));
    const body: PlaystyleResponse = { found: true, url: stats.url, cards, listed: [...best.keys()], details };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/playstyle", error);
    return Response.json({ error: "Couldn't reach EDHREC or Scryfall.", detail }, { status: 502 });
  }
}
