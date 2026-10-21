import type { NextRequest } from "next/server";
import type { PlaystyleCard, PlaystyleResponse } from "@/lib/deck-beta/api";
import { getCommanderTheme } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { getCardDetails } from "@/lib/sources/scryfall";
import { edhrecSlug } from "@/lib/slugs";

/** Recommendations that get full details (images, colors, text): one Scryfall request's worth. */
const DETAILED = 60;

// GET /api/deck-beta/playstyle?commander=Atraxa%2C%20Praetors%27%20Voice&layout=normal&theme=infect
// Deck Synergy: the best cards for one of a commander's playstyles, per EDHREC.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const commander = params.get("commander")?.trim() ?? "";
  const layout = params.get("layout")?.trim() || "normal";
  const theme = params.get("theme")?.trim() ?? "";
  if (!commander || commander.length > 150 || !/^[a-z0-9-]{1,80}$/.test(theme) || layout.length > 40) {
    return Response.json({ error: "Give a commander and a playstyle." }, { status: 400 });
  }

  try {
    const stats = await getCommanderTheme(edhrecSlug(commander, layout), theme);
    if (!stats) return Response.json({ found: false } satisfies PlaystyleResponse);

    // Each card once, with its best showing across EDHREC's lists.
    const best = new Map<string, PlaystyleCard>();
    for (const list of stats.lists) {
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
    const details = await getCardDetails(cards.slice(0, DETAILED).map((c) => c.name));
    const body: PlaystyleResponse = { found: true, url: stats.url, cards, listed: [...best.keys()], details };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/playstyle", error);
    return Response.json({ error: "Couldn't reach EDHREC or Scryfall.", detail }, { status: 502 });
  }
}
