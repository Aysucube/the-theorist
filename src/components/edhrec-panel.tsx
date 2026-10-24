import { formatCount, formatPercent } from "@/lib/format";
import { edhrecSlug } from "@/lib/slugs";
import { getCardStats, getCommanderStats } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import type { EdhrecCardRef, ScryfallCard } from "@/lib/types";
import { AddToDeckToggle } from "./deck-buttons";
import { CardLink } from "./card-link";
import { ListTools } from "./list-tools";
import { Panel, SourceMessage } from "./panel";
import { PriceCheck } from "./price-check";

const TITLE = "EDHREC";
const PER_LIST = 12;

async function settle<T>(p: Promise<T>): Promise<T | Error> {
  try {
    return await p;
  } catch (e) {
    reportSourceError("EdhrecPanel", e);
    return e instanceof Error ? e : new Error(String(e));
  }
}

export async function EdhrecPanel({ card }: { card: ScryfallCard }) {
  const slug = edhrecSlug(card.name, card.layout);
  const [stats, commander] = await Promise.all([
    settle(getCardStats(slug)),
    card.canBeCommander ? settle(getCommanderStats(slug)) : Promise.resolve(null),
  ]);

  if (stats instanceof Error && (commander === null || commander instanceof Error)) {
    return (
      <Panel title={TITLE} source="EDHREC">
        <SourceMessage>Couldn’t reach EDHREC right now. Try again in a bit.</SourceMessage>
      </Panel>
    );
  }

  const cardStats = stats instanceof Error ? null : stats;
  const commanderStats = commander instanceof Error ? null : commander;

  if (!cardStats && !commanderStats) {
    return (
      <Panel title={TITLE} source="EDHREC">
        <SourceMessage>EDHREC has no data for this card.</SourceMessage>
      </Panel>
    );
  }

  return (
    <Panel title={TITLE} source="EDHREC" sourceUrl={commanderStats?.url ?? cardStats?.url}>
      <div className="flex flex-col gap-6">
        {cardStats && (
          <div>
            <p className="text-lg">
              Played in <strong>{formatPercent(cardStats.inclusion)}</strong> of decks that
              could run it
            </p>
            <p className="text-sm text-muted">
              {formatCount(cardStats.numDecks)} of {formatCount(cardStats.potentialDecks)} decks
              {cardStats.salt !== undefined && ` · Salt score ${cardStats.salt.toFixed(2)}`}
            </p>
          </div>
        )}

        {commanderStats && (
          <p className="text-lg">
            Leads <strong>{formatCount(commanderStats.numDecks)}</strong> decks on EDHREC
            {commanderStats.rank && (
              <span className="text-muted"> · #{formatCount(commanderStats.rank)} commander</span>
            )}
          </p>
        )}

        {commanderStats ? (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="font-medium">Recommended cards for this commander</h3>
              <p className="text-xs text-muted">
                First number: share of this commander’s decks that run the card. Colored
                number: synergy, how much more often it appears here than in other decks.
                “Check ₱” looks up the cheapest Philippine price on TCGph.
              </p>
            </div>
            {commanderStats.lists.map((list, i) => (
              <CardList key={list.header} title={list.header} cards={list.cards} open={i < 2} showSynergy />
            ))}
          </div>
        ) : (
          cardStats &&
          cardStats.topCommanders.length > 0 && (
            <CardList title="Commanders that run it most" cards={cardStats.topCommanders} open />
          )
        )}
      </div>
    </Panel>
  );
}

export function CardList({
  title,
  cards,
  open,
  showSynergy,
}: {
  title: string;
  cards: EdhrecCardRef[];
  open?: boolean;
  showSynergy?: boolean;
}) {
  return (
    <details open={open} className="group rounded-lg border border-line">
      <summary className="cursor-pointer px-3 py-2 font-medium">
        {title} <span className="text-sm font-normal text-muted">({cards.length})</span>
      </summary>
      {/* grid-cols-1 (not the default auto column) lets long card names truncate on phones. */}
      <ul className="grid grid-cols-1 gap-x-4 px-3 pb-3 sm:grid-cols-2">
        {cards.slice(0, PER_LIST).map((c) => (
          <li
            key={c.name}
            className="flex items-center gap-3 border-b border-line py-1.5 text-sm last:border-0"
          >
            <AddToDeckToggle name={c.name} />
            <CardLink name={c.name} className="min-w-0 flex-1 truncate hover:underline" />
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {c.inclusion !== undefined && formatPercent(c.inclusion)}
              {showSynergy && c.synergy !== undefined && (
                <span className={c.synergy >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {" "}
                  {c.synergy >= 0 ? "+" : ""}
                  {formatPercent(c.synergy)}
                </span>
              )}
            </span>
            {/* Reserves room for the button; a checked price with its shop code can grow wider. */}
            <span className="min-w-20 shrink-0 text-right">
              <PriceCheck name={c.name} />
            </span>
          </li>
        ))}
      </ul>
      <ListTools names={cards.slice(0, PER_LIST).map((c) => c.name)} />
    </details>
  );
}
