import { connection } from "next/server";
import { reportSourceError } from "@/lib/sources/http";
import { getGameChangers } from "@/lib/sources/scryfall";

// GET /api/game-changers
// The Commander Game Changers list with each card's details, for the labels
// across the app and Deck Synergy's bracket check. Browsers keep it a day.
export async function GET() {
  // Answered per request (from the day's cache), not baked in at build time,
  // so a build without internet doesn't leave an error in place.
  await connection();
  try {
    const cards = await getGameChangers();
    if (cards.length === 0) return Response.json({ error: "Scryfall returned no Game Changers." }, { status: 502 });
    return Response.json({ cards }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (error) {
    const detail = reportSourceError("api/game-changers", error);
    return Response.json({ error: "Couldn't reach Scryfall.", detail }, { status: 502 });
  }
}
