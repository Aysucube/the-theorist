import type { NextRequest } from "next/server";
import type { PrintingsResponse } from "@/lib/deck-beta/api";
import { pricePrintings } from "@/lib/printings";
import { reportSourceError } from "@/lib/sources/http";
import { findCard, getPrintings } from "@/lib/sources/scryfall";
import { getPrices } from "@/lib/sources/tcgph";
import { tcgphSlug } from "@/lib/slugs";

// GET /api/deck-beta/printings?name=Sol%20Ring
// A deck's Edit tab: every printing of a card, with its art variants and what
// PH stores have of each, for picking the one you want.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > 150) {
    return Response.json({ error: "Give a card name." }, { status: 400 });
  }

  try {
    const card = (await findCard(name))?.card;
    if (!card?.oracleId) return Response.json({ found: false } satisfies PrintingsResponse);
    const [printings, prices] = await Promise.all([
      getPrintings(card.oracleId),
      // The printings are what matter; prices are a bonus if TCGph answers.
      getPrices(tcgphSlug(card.name)).catch((error) => {
        reportSourceError("api/deck-beta/printings price", error);
        return null;
      }),
    ]);
    const { inStock, notInStock } = pricePrintings(printings, prices);
    const body: PrintingsResponse = { found: true, printings: [...inStock, ...notInStock] };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/printings", error);
    return Response.json({ error: "Couldn't reach Scryfall.", detail }, { status: 502 });
  }
}
