import { reportSourceError } from "@/lib/sources/http";
import { getRulings } from "@/lib/sources/scryfall";
import type { Ruling, ScryfallCard } from "@/lib/types";
import { Panel, SourceMessage } from "./panel";
import { RulingsList } from "./rulings-list";

const TITLE = "Rulings";

/** The card's official rulings, in a scrolling box. */
export async function RulingsPanel({ card }: { card: ScryfallCard }) {
  let rulings: Ruling[];
  try {
    rulings = await getRulings(card.id);
  } catch (error) {
    reportSourceError("RulingsPanel", error);
    return (
      <Panel title={TITLE} source="Scryfall">
        <SourceMessage>Couldn’t load rulings right now. Try again in a bit.</SourceMessage>
      </Panel>
    );
  }

  return (
    <Panel title={TITLE} source="Scryfall" sourceUrl={card.scryfallUrl}>
      {rulings.length > 0 && (
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {rulings.length} official {rulings.length === 1 ? "ruling" : "rulings"} on how {card.name} works.
        </p>
      )}
      <RulingsList rulings={rulings} />
    </Panel>
  );
}
