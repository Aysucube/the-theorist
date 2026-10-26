import type { NextRequest } from "next/server";
import type { CommanderPlanResponse } from "@/lib/deck-beta/api";
import { getCommanderStats } from "@/lib/sources/edhrec";
import { getCommanderArticles } from "@/lib/sources/edhrec-articles";
import { reportSourceError } from "@/lib/sources/http";
import { edhrecSlug } from "@/lib/slugs";

// GET /api/deck-beta/commander-plan?commander=Lathril%2C%20Blade%20of%20the%20Elves&layout=normal
// How a commander is built and played, for its game plan on a deck's page:
// EDHREC's playstyles for it, what its average deck holds and costs, and
// EDHREC's articles about it. Both lookups are cached on the server.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const commander = params.get("commander")?.trim() ?? "";
  const layout = params.get("layout")?.trim() || "normal";
  if (!commander || commander.length > 150 || layout.length > 40) {
    return Response.json({ error: "Give a commander." }, { status: 400 });
  }

  try {
    const [stats, articles] = await Promise.all([
      getCommanderStats(edhrecSlug(commander, layout)),
      getCommanderArticles(commander).catch(() => []),
    ]);
    if (!stats) return Response.json({ found: false } satisfies CommanderPlanResponse);
    const body: CommanderPlanResponse = {
      found: true,
      url: stats.url,
      numDecks: stats.numDecks,
      themes: stats.themes ?? [],
      averages: stats.averages,
      curveAverage: stats.curveAverage,
      articles,
    };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/commander-plan", error);
    return Response.json({ error: "Couldn't reach EDHREC.", detail }, { status: 502 });
  }
}
