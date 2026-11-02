// What to cut from a deck over 100 cards: lands first while it has more than
// its curve wants, keeping its colors as near its spells as it can, then the
// spells at its most crowded costs, the ones it would miss least. Pure, so it's
// easy to test.
import type { CardDetails } from "@/lib/types";
import { afterEdits, colorGap, landCuts, type BalanceCut } from "./color-balance";
import { colorDistribution, isLandCard } from "./lands";

type DeckLine = { card: CardDetails; qty: number };

/** One mana value of the deck, its spells in the order to cut them. */
interface CostSlot {
  have: number;
  target: number;
  cards: (BalanceCut & { keeps?: boolean })[];
}

const CROWDED = "Your most crowded cost, and the card there you’d miss least";
const TOO_MANY_LANDS = "More lands than this deck’s curve wants";

/** The deck's spells in the order to cut them: from its most crowded cost down, with cards it still needs left till nothing else remains. */
export function spellCutOrder(slots: CostSlot[]): BalanceCut[] {
  const costs = slots.map((slot) => ({ excess: slot.have - slot.target, left: [...slot.cards] }));
  const order: BalanceCut[] = [];
  for (;;) {
    const open = costs.filter((cost) => cost.left.length > 0).sort((a, b) => b.excess - a.excess);
    const cost = open.find((c) => !c.left[0].keeps) ?? open[0];
    if (!cost) return order;
    const { card, why, keeps } = cost.left.shift()!;
    cost.excess--;
    order.push({ card, why: keeps ? CROWDED : why });
  }
}

/** The cuts that bring a deck down by this many cards, the first to go at the front. */
export function overCuts({
  cards,
  over,
  identity,
  commander,
  landTarget,
  slots,
}: {
  cards: DeckLine[];
  /** How many cards too many it has. */
  over: number;
  identity: string[];
  commander?: string;
  landTarget: number;
  slots: CostSlot[];
}): BalanceCut[] {
  const spells = spellCutOrder(slots);
  const cuts: BalanceCut[] = [];
  let deck = cards;
  // The land that leaves the colors closest to the spells.
  const bestLand = () => {
    const options = landCuts(deck, identity, commander).map((cut) => ({ cut, gap: colorGap(colorDistribution(afterEdits(deck, [{ cut }]), identity)) }));
    return options.sort((a, b) => a.gap - b.gap)[0]?.cut;
  };
  while (cuts.length < over) {
    const lands = deck.reduce((sum, { card, qty }) => sum + (isLandCard(card) ? qty : 0), 0);
    const land = lands > landTarget || spells.length === 0 ? bestLand() : undefined;
    const cut = land ? { ...land, why: land.why === "Basic land" ? TOO_MANY_LANDS : land.why } : spells.shift();
    if (!cut) break;
    cuts.push(cut);
    deck = afterEdits(deck, [{ cut }]);
  }
  return cuts;
}

/** Cuts side by side, copies of a card read as one. */
export function groupCuts(cuts: BalanceCut[]): (BalanceCut & { count: number })[] {
  const groups = new Map<string, BalanceCut & { count: number }>();
  for (const cut of cuts) {
    const seen = groups.get(cut.card.name);
    groups.set(cut.card.name, seen ? { ...seen, count: seen.count + 1 } : { ...cut, count: 1 });
  }
  return [...groups.values()];
}
