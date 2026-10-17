import type { NextRequest } from "next/server";
import { getPriceSummary } from "@/lib/prices";
import type { PriceResponse } from "@/lib/types";

// GET /api/price?name=Sol%20Ring -> { found: true, cheapest: { pricePhp: 90, ... }, stores, listings, url }
// Called only when a visitor clicks "Check ₱", so TCGph sees one request per card they ask about.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > 150) {
    return Response.json({ error: "Give a card name." }, { status: 400 });
  }

  try {
    const summary = await getPriceSummary(name);
    const body: PriceResponse = summary ? { found: true, ...summary } : { found: false };
    // Prices move slowly; let the browser reuse an answer for 10 minutes.
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch {
    return Response.json({ error: "Couldn't reach the price sources." }, { status: 502 });
  }
}
