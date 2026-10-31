import type { NextRequest } from "next/server";
import { getAlternatives } from "@/lib/similar";
import { reportSourceError } from "@/lib/sources/http";

// GET /api/alternatives?name=Cyclonic%20Rift -> { alternatives: [{ name, typeLine, price }, ...] }
// Called only when a visitor opens a card's menu on the Shopping page, so TCGph
// sees these lookups only for the cards they ask about.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > 150) {
    return Response.json({ error: "Give a card name." }, { status: 400 });
  }

  try {
    const body = await getAlternatives(name);
    // Prices move slowly; let the browser reuse a full answer for 10 minutes.
    return Response.json(body, body.incomplete ? undefined : { headers: { "Cache-Control": "public, max-age=600" } });
  } catch (error) {
    const detail = reportSourceError("api/alternatives", error);
    return Response.json({ error: "Couldn't reach the card sources.", detail }, { status: 502 });
  }
}
