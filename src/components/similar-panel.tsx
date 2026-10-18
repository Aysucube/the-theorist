import { formatPhp } from "@/lib/format";
import { reportSourceError } from "@/lib/sources/http";
import { getSimilarCards, type SimilarCard } from "@/lib/similar";
import type { ScryfallCard } from "@/lib/types";
import { CardTile } from "./card-tile";
import { Panel, SourceMessage } from "./panel";

const TITLE = "Similar cards";

/** A gallery of cards with almost the same effect, always shown (not folded away). */
export async function SimilarPanel({ card }: { card: ScryfallCard }) {
  let similar: SimilarCard[];
  try {
    similar = await getSimilarCards(card);
  } catch (error) {
    reportSourceError("SimilarPanel", error);
    return (
      <Panel title={TITLE} source="EDHREC">
        <SourceMessage>Couldn’t load similar cards right now. Try again in a bit.</SourceMessage>
      </Panel>
    );
  }

  if (similar.length === 0) {
    return (
      <Panel title={TITLE} source="EDHREC">
        <SourceMessage>EDHREC doesn’t list any similar cards for this one.</SourceMessage>
      </Panel>
    );
  }

  return (
    <Panel title={TITLE} source="EDHREC">
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Cards that do almost the same job as {card.name}. Hover one to read its effect; click to open it.
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {similar.map((s) => (
          <li key={s.name}>
            <CardTile name={s.name} imageUrl={s.imageUrl}>
              {s.cheapest ? (
                <>
                  <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                    {formatPhp(s.cheapest.pricePhp)}
                  </span>{" "}
                  <span className="text-zinc-600 dark:text-zinc-400">{s.cheapest.store}</span>
                </>
              ) : (
                <span className="text-zinc-500">{s.priceUnavailable ? "Price unavailable" : "Not in PH stores"}</span>
              )}
            </CardTile>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
