import type { NextRequest } from "next/server";
import { getCardPairings } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { getCardDetails } from "@/lib/sources/scryfall";
import { edhrecSlug } from "@/lib/slugs";
import type { PairingsResponse } from "@/lib/deck-beta/api";
import { byStrength } from "@/lib/deck-beta/recommend";

/** Recommendations get full details (colors, types, text); two Scryfall requests' worth. */
const DETAILED_PAIRINGS = 140;

// GET /api/deck-beta/pairings?name=Elvish%20Archdruid&layout=normal
// Deck beta only: what EDHREC says is played with a card, plus details for the strongest matches.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = params.get("name")?.trim() ?? "";
  const layout = params.get("layout")?.trim() || "normal";
  if (!name || name.length > 150 || layout.length > 40) {
    return Response.json({ error: "Give a card name." }, { status: 400 });
  }

  try {
    const stats = await getCardPairings(edhrecSlug(name, layout));
    if (!stats) return Response.json({ found: false } satisfies PairingsResponse);

    const pairings = stats.pairings.filter((p) => p.lift > 1).sort(byStrength);
    const wanted = [...new Set([...pairings.slice(0, DETAILED_PAIRINGS).map((p) => p.name), ...stats.similar])];
    const details = wanted.length > 0 ? await getCardDetails(wanted) : {};
    const body: PairingsResponse = { found: true, url: stats.url, pairings, similar: stats.similar, details };
    // EDHREC's numbers change slowly; let the browser reuse them for an hour.
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/pairings", error);
    return Response.json({ error: "Couldn't reach EDHREC or Scryfall.", detail }, { status: 502 });
  }
}
