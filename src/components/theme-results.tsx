import { formatCount } from "@/lib/format";
import { getTheme } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import { getCardInfo } from "@/lib/sources/scryfall";
import type { CardInfo, EdhrecThemePage } from "@/lib/types";
import { CardTile } from "./card-tile";
import { CardList } from "./edhrec-panel";
import { Panel, SourceMessage } from "./panel";

/** A deck theme's top commanders (as a gallery) and the cards its decks play. */
export async function ThemeResults({ slug }: { slug: string }) {
  let theme: EdhrecThemePage | null;
  try {
    theme = await getTheme(slug);
  } catch (error) {
    reportSourceError("ThemeResults", error);
    return (
      <Panel title="Deck theme" source="EDHREC">
        <SourceMessage>Couldn’t reach EDHREC right now. Try again in a bit.</SourceMessage>
      </Panel>
    );
  }
  if (!theme) {
    return (
      <Panel title="Deck theme" source="EDHREC">
        <SourceMessage>EDHREC doesn’t have a theme called “{slug}”. Pick one from the list above.</SourceMessage>
      </Panel>
    );
  }

  // Artwork for the commanders, in one bulk Scryfall request. The names still show without it.
  let info: Record<string, CardInfo> = {};
  try {
    info = theme.commanders.length > 0 ? await getCardInfo(theme.commanders.map((c) => c.name)) : {};
  } catch (error) {
    reportSourceError("ThemeResults", error);
  }

  return (
    <div className="flex flex-col gap-8">
      <Panel title={`${theme.name} commanders`} source="EDHREC" sourceUrl={theme.url}>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {formatCount(theme.numDecks)} decks on EDHREC are built around {theme.name}. These commanders lead the
          most of them. Open one for its own recommendations and Philippine prices.
        </p>
        {theme.commanders.length === 0 ? (
          <SourceMessage>EDHREC doesn’t list commanders for this theme.</SourceMessage>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {theme.commanders.map((c) => (
              <li key={c.name}>
                <CardTile name={c.name} imageUrl={info[c.name]?.imageUrl}>
                  <span className="text-zinc-600 tabular-nums dark:text-zinc-400">{formatCount(c.numDecks)} decks</span>
                </CardTile>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Recommended ${theme.name} cards`} source="EDHREC" sourceUrl={theme.url}>
        <p className="mb-4 text-xs text-zinc-500">
          First number: share of {theme.name} decks that run the card. Colored number: synergy, how much more often
          it shows up in these decks than in others. “Check ₱” looks up the cheapest Philippine price on TCGph.
        </p>
        <div className="flex flex-col gap-3">
          {theme.lists.map((list, i) => (
            <CardList key={list.header} title={list.header} cards={list.cards} open={i < 2} showSynergy />
          ))}
        </div>
      </Panel>
    </div>
  );
}
