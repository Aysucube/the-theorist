import type { NextRequest } from "next/server";
import { getCardPreview } from "@/lib/prices";
import { reportSourceError } from "@/lib/sources/http";

// GET /api/preview?name=Sol%20Ring -> { name, imageUrl, cheapest: { pricePhp, store, ... }, stores }
// Feeds the hover card on card links. Uses the same cached lookups as /api/price.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > 150) {
    return Response.json({ error: "Give a card name." }, { status: 400 });
  }

  try {
    const preview = await getCardPreview(name);
    // Prices move slowly; let the browser reuse a preview for 10 minutes.
    return Response.json(preview, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch (error) {
    const detail = reportSourceError("api/preview", error);
    return Response.json({ error: "Couldn't load a preview.", detail }, { status: 502 });
  }
}
