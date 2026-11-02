// How a deck splits across card types, against the average deck for its
// commander on EDHREC, and what would bring the two together. EDHREC counts each
// card as one type, as cardTypeOf does, so its numbers add up to the 99. Kept
// free of React so it's easy to test.
import type { BalanceCut } from "@/lib/deck-beta/color-balance";
import { scaledCurve } from "@/lib/deck-beta/curve";
import { cardKey } from "@/lib/deck-beta/recommend";
import type { CardDetails, EdhrecDeckAverages } from "@/lib/types";
import { allOffered, CARD_TYPES, cardTypeOf, type BuilderGroups, type BuilderPick, type CurveSlot } from "./plan";

const AVERAGE_OF: Record<string, keyof EdhrecDeckAverages> = {
  Creatures: "creatures",
  Planeswalkers: "planeswalkers",
  Instants: "instants",
  Sorceries: "sorceries",
  Artifacts: "artifacts",
  Enchantments: "enchantments",
  Battles: "battles",
};
/** A deck this close to the average on a type needs no change to it. */
const CLOSE_ENOUGH = 1;
/** Cards suggested for each type that's short. */
const PICKS = 6;

export interface TypeRow {
  type: string;
  /** Cards of this type in the deck, the commander left out. */
  have: number;
  /** How many to aim for in the 99; undefined without EDHREC's numbers. */
  aim?: number;
}

/**
 * The deck by card type against EDHREC's average. The average's spells are
 * scaled to fit `lands`, the lands the deck is set to run; without that, its own
 * land count stands. `basics` are lands that aren't in `cards` yet.
 */
export function typeRatio(cards: { card: CardDetails; qty: number }[], { averages, commander, lands, basics = 0 }: { averages?: EdhrecDeckAverages; commander?: string; lands?: number; basics?: number }): TypeRow[] {
  const have = new Map<string, number>([["Lands", basics]]);
  for (const { card, qty } of cards) {
    if (card.name === commander) continue;
    const type = cardTypeOf(card);
    have.set(type, (have.get(type) ?? 0) + qty);
  }
  const spellTypes = CARD_TYPES.filter((type) => type !== "Lands");
  const landAim = lands ?? Math.round(averages?.lands ?? 0);
  const spellAims = averages ? scaledCurve(spellTypes.map((type) => averages[AVERAGE_OF[type]]), 99 - landAim) : [];
  const aimOf = (type: string) => (!averages ? undefined : type === "Lands" ? landAim : type === "Other" ? 0 : spellAims[spellTypes.indexOf(type)]);
  return [...CARD_TYPES, "Other"].map((type) => ({ type, have: have.get(type) ?? 0, aim: aimOf(type) })).filter((row) => row.have > 0 || (row.aim ?? 0) > 0);
}

/** What to do about one type: add `picks`, or cut `cuts`. */
export interface TypeMove {
  type: string;
  /** Cards more than the average (negative when it's short). */
  over: number;
  picks: BuilderPick[];
  cuts: BalanceCut[];
}

/**
 * For each type a deck is short of, the strongest cards of that type it could
 * add within its bracket; for each it has too many of, the ones these decks play
 * least, keeping what the template still needs till last. Lands are left to the
 * mana base.
 */
export function typeMoves(rows: TypeRow[], groups: BuilderGroups & { curveSlots: CurveSlot[] }): TypeMove[] {
  const barred = new Set(groups.template.flatMap((s) => s.heldBack).map((p) => cardKey(p.card.name)));
  const offered = allOffered(groups)
    .filter((p) => !barred.has(cardKey(p.card.name)))
    .sort((a, b) => (b.synergy ?? -1) - (a.synergy ?? -1) || (b.inclusion ?? 0) - (a.inclusion ?? 0));
  const order = groups.curveSlots
    .flatMap((slot) => slot.cards)
    .sort((a, b) => Number(a.keeps ?? false) - Number(b.keeps ?? false) || (a.inclusion ?? 0) - (b.inclusion ?? 0))
    .map((cut) => ({ card: cut.card, why: cut.inclusion === undefined ? "Not in these decks" : `${Math.round(cut.inclusion * 100)}% of these decks` }));
  return rows.flatMap((row) => {
    const over = row.have - (row.aim ?? row.have);
    if (row.type === "Lands" || Math.abs(over) <= CLOSE_ENOUGH) return [];
    const picks = over < 0 ? offered.filter((p) => cardTypeOf(p.card) === row.type).slice(0, PICKS) : [];
    const cuts = over > 0 ? order.filter((cut) => cardTypeOf(cut.card) === row.type).slice(0, over) : [];
    return picks.length + cuts.length > 0 ? [{ type: row.type, over, picks, cuts }] : [];
  });
}
