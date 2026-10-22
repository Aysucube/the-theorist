import type { NextRequest } from "next/server";
import type { LandArtResponse } from "@/lib/deck-beta/api";
import { hashString, landFor } from "@/lib/deck-beta/land-art";
import { reportSourceError } from "@/lib/sources/http";
import { getLandArts } from "@/lib/sources/scryfall";

// GET /api/deck-beta/land-art?colors=WG&seed=Trostani%2C%20Selesnya%27s%20Voice
// Deck Synergy: artwork of a land in the commander's colors (Savannah for
// green-white), for the network's background. Full-art and borderless
// printings are preferred; the seed picks among them so a deck keeps its land.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const colors = (params.get("colors") ?? "").toUpperCase();
  const seed = params.get("seed") ?? "";
  if (!/^[WUBRG]{0,5}$/.test(colors) || seed.length > 150) {
    return Response.json({ error: "Give colors as letters from WUBRG." }, { status: 400 });
  }

  const name = landFor([...colors], seed);
  try {
    const arts = await getLandArts(name);
    const full = arts.filter((a) => a.fullArt);
    const options = full.length > 0 ? full : arts;
    if (options.length === 0) return Response.json({ found: false } satisfies LandArtResponse);
    const art = options[hashString(`${seed}|${name}`) % options.length];
    const body: LandArtResponse = { found: true, name, artUrl: art.artUrl, artist: art.artist, set: art.set };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/land-art", error);
    return Response.json({ error: "Couldn't reach Scryfall.", detail }, { status: 502 });
  }
}
