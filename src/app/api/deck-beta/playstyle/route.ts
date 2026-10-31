import type { NextRequest } from "next/server";
import { styleLean } from "@/lib/builder/plan";
import type { PlaystyleCard, PlaystyleResponse } from "@/lib/deck-beta/api";
import { getCommanderStats, getCommanderTheme, getThemeInColors } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { getCardDetails } from "@/lib/sources/scryfall";
import { edhrecSlug } from "@/lib/slugs";
import type { EdhrecCardList } from "@/lib/types";

/** Cards that get full details (images, colors, text) for one playstyle: all it lists, as Create Commander Deck ranks them all (six requests). */
const DETAILED_THEME = 450;
/** For all the commander's decks: enough to read every card's job for the upgrade picks (three requests). */
const DETAILED_ALL = 225;

const cardsIn = (lists: EdhrecCardList[] | undefined) => (lists ?? []).flatMap((list) => list.cards);

// GET /api/deck-beta/playstyle?commander=Atraxa%2C%20Praetors%27%20Voice&layout=normal&theme=infect&colors=WUBG
// Deck Synergy: the best cards for one of a commander's playstyles, per EDHREC. Without a theme,
// the commander's cards across all its decks (for the Recommendations tab), lands left out.
// With the deck's colors, Create Commander Deck also learns how far each card leans into the
// playstyle, and gets the cards the playstyle plays in those colors that this commander's decks don't.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const commander = params.get("commander")?.trim() ?? "";
  const layout = params.get("layout")?.trim() || "normal";
  const theme = params.get("theme")?.trim() ?? "";
  const colors = params.get("colors")?.toUpperCase();
  if (!commander || commander.length > 150 || (theme && !/^[a-z0-9-]{1,80}$/.test(theme)) || layout.length > 40 || (colors && !/^[WUBRG]{0,5}$/.test(colors))) {
    return Response.json({ error: "Give a commander (and optionally a playstyle)." }, { status: 400 });
  }

  try {
    const slug = edhrecSlug(commander, layout);
    const stats = theme ? await getCommanderTheme(slug, theme) : await getCommanderStats(slug);
    if (!stats) return Response.json({ found: false } satisfies PlaystyleResponse);

    // Each card once, with its best showing across EDHREC's lists.
    const best = new Map<string, PlaystyleCard>();
    for (const list of stats.lists) {
      if (!theme && /lands/i.test(list.header)) continue;
      for (const c of list.cards) {
        const seen = best.get(c.name);
        const lists = [...(seen?.lists ?? []), list.header];
        if (!seen || (seen.synergy ?? -1) < (c.synergy ?? -1)) {
          best.set(c.name, { name: c.name, synergy: c.synergy, inclusion: c.inclusion, numDecks: c.numDecks, lists });
        } else {
          seen.lists = lists;
        }
      }
    }

    if (theme && colors !== undefined) {
      const [overall, inColors] = await Promise.all([
        getCommanderStats(slug),
        // The commander's own playstyle page still works without it.
        getThemeInColors(theme, [...colors]).catch((error) => {
          reportSourceError("api/deck-beta/playstyle colors", error);
          return null;
        }),
      ]);
      const shareOverall = new Map(cardsIn(overall?.lists).map((c) => [c.name, c.inclusion]));
      const colorCards = cardsIn(inColors?.lists);
      const colorSynergy = new Map(colorCards.map((c) => [c.name, c.synergy]));
      for (const card of best.values()) card.lean = styleLean(card.inclusion, shareOverall.get(card.name), stats.numDecks, colorSynergy.get(card.name));
      for (const c of colorCards) {
        if (best.has(c.name)) continue;
        best.set(c.name, { name: c.name, synergy: c.synergy, inclusion: c.inclusion, numDecks: c.numDecks, lists: [], lean: styleLean(undefined, undefined, 0, c.synergy) });
      }
    }

    const cards = [...best.values()].sort(
      (a, b) => (b.lean ?? 0) - (a.lean ?? 0) || (b.synergy ?? -1) - (a.synergy ?? -1) || (b.inclusion ?? 0) - (a.inclusion ?? 0),
    );
    // For the whole commander, detail the most played and highest-synergy cards.
    const toDetail = theme
      ? cards.slice(0, DETAILED_THEME)
      : [...cards]
          .sort((a, b) => (b.inclusion ?? 0) + Math.max(0, b.synergy ?? 0) - ((a.inclusion ?? 0) + Math.max(0, a.synergy ?? 0)))
          .slice(0, DETAILED_ALL);
    const details = await getCardDetails(toDetail.map((c) => c.name));
    const body: PlaystyleResponse = {
      found: true,
      url: stats.url,
      numDecks: stats.numDecks,
      averages: stats.averages,
      bracketCounts: stats.bracketCounts,
      curveAverage: stats.curveAverage,
      cards,
      listed: [...best.keys()],
      details,
    };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    const detail = reportSourceError("api/deck-beta/playstyle", error);
    return Response.json({ error: "Couldn't reach EDHREC or Scryfall.", detail }, { status: 502 });
  }
}
