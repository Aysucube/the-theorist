import type { NextRequest } from "next/server";
import type { RulingsResponse } from "@/lib/deck-beta/api";
import { reportSourceError } from "@/lib/sources/http";
import { findCard, getRulings } from "@/lib/sources/scryfall";

// GET /api/deck-beta/rulings?name=Doubling%20Season -> { found, name, rulings: [{ source, publishedAt, comment }] }
// Deck beta: the official rulings for the card that's selected.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > 150) {
    return Response.json({ error: "Give a card name." }, { status: 400 });
  }

  try {
    const lookup = await findCard(name);
    if (!lookup) return Response.json({ found: false } satisfies RulingsResponse);
    const body: RulingsResponse = {
      found: true,
      name: lookup.card.name,
      scryfallUrl: lookup.card.scryfallUrl,
      rulings: await getRulings(lookup.card.id),
    };
    // Rulings change a few times a year at most; let the browser reuse them for a day.
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/rulings", error);
    return Response.json({ error: "Couldn't reach Scryfall.", detail }, { status: 502 });
  }
}
