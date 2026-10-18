import { MAX_DECK_CARDS } from "@/lib/deck";
import { reportSourceError } from "@/lib/sources/http";
import { getCardInfo } from "@/lib/sources/scryfall";

// POST /api/cards/info { names: ["Sol Ring", ...] } -> { cards: { "Sol Ring": { typeLine, manaCost, ... } } }
// Type lines and mana costs for a whole deck in one or two Scryfall requests.
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
    return Response.json({ cards: await getCardInfo(names as string[]) });
  } catch (error) {
    const detail = reportSourceError("api/cards/info", error);
    return Response.json({ error: "Couldn't reach Scryfall.", detail }, { status: 502 });
  }
}
