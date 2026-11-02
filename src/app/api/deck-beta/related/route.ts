import type { NextRequest } from "next/server";
import { MAX_DECK_CARDS } from "@/lib/deck";
import { partIds, sortRelated, type DeckRelated } from "@/lib/deck-beta/related";
import { reportSourceError } from "@/lib/sources/http";
import { getRelatedLooks, getRelatedParts } from "@/lib/sources/scryfall";

// POST /api/deck-beta/related { names: ["Bitterblossom", ...] }
// A deck's Edit tab: the tokens its cards make, its emblems and game pieces, and
// its meld and transform partners, from what Scryfall links to each card.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { names?: unknown } | null;
  const names = Array.isArray(body?.names) ? body.names.filter((n): n is string => typeof n === "string" && n.length <= 150) : [];
  if (names.length === 0 || names.length > MAX_DECK_CARDS) {
    return Response.json({ error: `Give up to ${MAX_DECK_CARDS} card names.` }, { status: 400 });
  }

  try {
    const parts = await getRelatedParts(names);
    const meldIds = Object.values(parts).flatMap((list) => list.filter((p) => p.id && p.component === "meld_result").map((p) => p.id!));
    const looks = await getRelatedLooks([...new Set([...partIds(parts), ...meldIds])]);
    const result: DeckRelated = sortRelated(parts, looks);
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/related", error);
    return Response.json({ error: "Couldn't reach Scryfall.", detail }, { status: 502 });
  }
}
