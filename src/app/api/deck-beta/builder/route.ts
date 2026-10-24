import type { NextRequest } from "next/server";
import type { BuilderCard, BuilderResponse } from "@/lib/deck-beta/api";
import { getCommanderStats } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { getCardDetails } from "@/lib/sources/scryfall";
import { edhrecSlug } from "@/lib/slugs";

/** Cards that get full details: four Scryfall requests' worth. */
const DETAILED = 300;

// GET /api/deck-beta/builder?commander=Lathril%2C%20Blade%20of%20the%20Elves&layout=normal
// Create Commander Deck: everything EDHREC has for a commander — every card its
// decks play (with synergy, how often, and which lists: New Cards, Lands...),
// its playstyles, what its average deck holds and how its decks split across
// brackets — plus details for the cards that matter most.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const commander = params.get("commander")?.trim() ?? "";
  const layout = params.get("layout")?.trim() || "normal";
  if (!commander || commander.length > 150 || layout.length > 40) {
    return Response.json({ error: "Give a commander." }, { status: 400 });
  }

  try {
    const stats = await getCommanderStats(edhrecSlug(commander, layout));
    if (!stats) return Response.json({ found: false } satisfies BuilderResponse);

    // Each card once, with every list it appears in and its best synergy.
    const byName = new Map<string, BuilderCard>();
    for (const list of stats.lists) {
      for (const c of list.cards) {
        const seen = byName.get(c.name);
        if (seen) {
          seen.lists.push(list.header);
          if ((c.synergy ?? -1) > (seen.synergy ?? -1)) seen.synergy = c.synergy;
          continue;
        }
        byName.set(c.name, { name: c.name, synergy: c.synergy, inclusion: c.inclusion, numDecks: c.numDecks, lists: [list.header] });
      }
    }
    const cards = [...byName.values()];
    const weight = (c: BuilderCard) => (c.inclusion ?? 0) + Math.max(0, c.synergy ?? 0) + (c.lists.some((l) => /new/i.test(l)) ? 1 : 0);
    const toDetail = [...cards].sort((a, b) => weight(b) - weight(a)).slice(0, DETAILED);
    const details = await getCardDetails(toDetail.map((c) => c.name));

    const body: BuilderResponse = {
      found: true,
      url: stats.url,
      numDecks: stats.numDecks,
      themes: stats.themes ?? [],
      averages: stats.averages,
      bracketCounts: stats.bracketCounts,
      cards,
      details,
    };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/builder", error);
    return Response.json({ error: "Couldn't reach EDHREC or Scryfall.", detail }, { status: 502 });
  }
}
