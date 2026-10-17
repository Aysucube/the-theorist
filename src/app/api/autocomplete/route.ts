import type { NextRequest } from "next/server";
import { reportSourceError } from "@/lib/sources/http";
import { suggestCardNames } from "@/lib/sources/scryfall";

// GET /api/autocomplete?q=atra -> { names: ["Atraxa, Praetors' Voice", ...] }
// Proxies Scryfall so every visitor typing the same prefix shares one cached request.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const names = await suggestCardNames(q);
    return Response.json(
      { names },
      // Let the browser reuse answers while the user backspaces and retypes.
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (error) {
    reportSourceError("api/autocomplete", error);
    return Response.json({ names: [] }, { status: 502 });
  }
}
