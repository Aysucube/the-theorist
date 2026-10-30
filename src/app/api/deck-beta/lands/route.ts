import type { NextRequest } from "next/server";
import type { LandsResponse } from "@/lib/deck-beta/api";
import { fixesColors, landKind } from "@/lib/deck-beta/lands";
import { reportSourceError } from "@/lib/sources/http";
import { getFixingLands } from "@/lib/sources/scryfall";

// GET /api/deck-beta/lands?colors=BG
// Create Commander Deck: the dual lands and other fixing for a deck's colors,
// most played first, whether or not EDHREC lists them for its commander.
export async function GET(request: NextRequest) {
  const colors = (request.nextUrl.searchParams.get("colors") ?? "").toUpperCase();
  if (!/^[WUBRG]{0,5}$/.test(colors)) {
    return Response.json({ error: "Give colors as letters from WUBRG." }, { status: 400 });
  }
  const own = [..."WUBRG"].filter((c) => colors.includes(c));
  if (own.length < 2) return Response.json({ lands: [] } satisfies LandsResponse);

  try {
    // The search also finds spells with a land on the back, and lands that only happen to search.
    const lands = (await getFixingLands(own)).filter((card) => {
      const kind = landKind(card);
      return kind === "dual" || kind === "tapped" || (kind !== undefined && fixesColors(kind));
    });
    return Response.json({ lands } satisfies LandsResponse, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/lands", error);
    return Response.json({ error: "Couldn't reach Scryfall.", detail }, { status: 502 });
  }
}
