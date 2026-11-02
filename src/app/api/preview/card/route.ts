import type { NextRequest } from "next/server";
import type { CardLook } from "@/lib/card-look";
import { reportSourceError } from "@/lib/sources/http";
import { findCard } from "@/lib/sources/scryfall";

// GET /api/preview/card?name=Sol%20Ring -> { name, imageUrl, typeLine, ... }
// The part of a hover card that comes back in a moment, from Scryfall alone, so
// its image doesn't wait on /api/preview's prices (a basic land's take 12 seconds).
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > 150) {
    return Response.json({ error: "Give a card name." }, { status: 400 });
  }

  try {
    const card = (await findCard(name))?.card;
    const look: Partial<CardLook> = card
      ? { name: card.name, imageUrl: card.imageUrl, typeLine: card.typeLine, manaCost: card.manaCost, colorIdentity: card.colorIdentity, oracleText: card.oracleText }
      : {};
    // A card's art and rules text hardly ever change.
    return Response.json(look, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (error) {
    const detail = reportSourceError("api/preview/card", error);
    return Response.json({ error: "Couldn't look the card up.", detail }, { status: 502 });
  }
}
