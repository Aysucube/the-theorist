import { MAX_DECK_CARDS } from "@/lib/deck";
import { reportSourceError } from "@/lib/sources/http";
import { getCardDetails } from "@/lib/sources/scryfall";

// POST /api/deck-beta/cards { names: ["Sol Ring", ...] } -> { cards: { "Sol Ring": { typeLine, oracleText, ... } } }
// Deck beta only: artwork, types, colors and rules text for a whole deck in one or two Scryfall requests.
export async function POST(request: Request) {
  let names: unknown;
  try {
    names = ((await request.json()) as { names?: unknown }).names;
  } catch {
    names = undefined;
  }
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    names.length > MAX_DECK_CARDS ||
    !names.every((n) => typeof n === "string" && n.trim() && n.length <= 150)
  ) {
    return Response.json({ error: `Send { names: [...] } with 1 to ${MAX_DECK_CARDS} card names.` }, { status: 400 });
  }

  try {
    return Response.json({ cards: await getCardDetails(names as string[]) });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/cards", error);
    return Response.json({ error: "Couldn't reach Scryfall.", detail }, { status: 502 });
  }
}
