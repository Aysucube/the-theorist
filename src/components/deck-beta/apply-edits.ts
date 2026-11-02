import { toast } from "sonner";
import { afterEdits, type DeckEdit } from "@/lib/deck-beta/color-balance";
import { cardKey } from "@/lib/deck-beta/recommend";
import type { DeckSource } from "@/lib/deck-beta/store";
import type { CardDetails } from "@/lib/types";

/** Makes these edits to a deck in one go, and says so with a way to undo them. Cards that haven't loaded are left as they are. */
export function applyEdits(source: DeckSource, deckCards: { card: CardDetails; qty: number }[], edits: DeckEdit[], message: string) {
  const before = source.deck;
  const loaded = new Set(deckCards.map((line) => cardKey(line.card.name)));
  const others = before.filter((c) => !loaded.has(cardKey(c.name)));
  // Adding them keeps their details, so they show up at once.
  edits.forEach(({ add }) => add && source.add(add));
  source.replace([...others, ...afterEdits(deckCards, edits).map(({ card, qty }) => ({ name: card.name, qty }))]);
  toast.success(message, { action: { label: "Undo", onClick: () => source.replace(before) } });
}
