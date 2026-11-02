// What a deck still needs and the cards that would give it: the mana values off
// its curve, the lands its curve wants, the parts of the template it hasn't
// filled, its threats and its card types. A card that answers several of them
// comes first, and one at a cost that's already full sinks, so filling a gap
// doesn't knock the curve over. Each card is offered once, where it does the most
// good. Kept free of React so it's easy to test.
import { CURVE_LABELS, slotOf } from "@/lib/deck-beta/curve";
import { cardKey } from "@/lib/deck-beta/recommend";
import { CATEGORIES, CATEGORY_INFO, categoryGaps, type DeckProfile } from "@/lib/deck-beta/roles";
import { CLOSE_ENOUGH, leastPlayed, PICKS, type TypeMove, type TypeRow } from "./card-types";
import { cardTypeOf, type BuilderGroups, type BuilderPick, type CurveSlot } from "./plan";

/** Cards that answer several needs at once. */
const BEST_PICKS = 10;
/** Needs a card must answer to count as answering several. */
const SEVERAL = 2;

export interface DeckNeeds {
  /** Cards that answer two or more needs, the most first, each saying which. */
  best: BuilderPick[];
  /** Each need, in order: mana values, lands, the template, threats, card types. */
  moves: TypeMove[];
}

type Ranked = { pick: BuilderPick; needs: string[]; fit: number };

/** What the deck needs, as it stands; with `cost`, only the cards at that slot of the curve. */
export function deckNeeds(plan: BuilderGroups & { profile: DeckProfile; curveSlots: CurveSlot[] }, rows: TypeRow[], { cost }: { cost?: number } = {}): DeckNeeds {
  const { profile, curveSlots } = plan;
  const atCost = (card: { cmc: number }) => cost === undefined || slotOf(card.cmc) === cost;
  const room = (slot: number) => curveSlots[slot].target - curveSlots[slot].have;
  const gaps = categoryGaps(profile);
  const typeOver = (row: TypeRow) => row.have - (row.aim ?? row.have);
  const shortTypes = new Set(rows.filter((row) => row.type !== "Lands" && typeOver(row) < -CLOSE_ENOUGH).map((row) => row.type));
  const threatsShort = plan.threatTarget - plan.threatsInDeck.length;
  const threatPicks = new Set(threatsShort > CLOSE_ENOUGH ? plan.threats.filter((t) => t.have.length < t.aim).flatMap((t) => t.picks.map((p) => cardKey(p.card.name))) : []);

  const needsOf = (pick: BuilderPick) => {
    const slot = slotOf(pick.card.cmc);
    const type = cardTypeOf(pick.card);
    return [
      ...(room(slot) > CLOSE_ENOUGH ? [`${CURVE_LABELS[slot]} mana`] : []),
      ...pick.categories.filter((c) => (gaps[c] ?? 0) > 0).map((c) => CATEGORY_INFO[c].label),
      ...(threatPicks.has(cardKey(pick.card.name)) ? ["Threat"] : []),
      ...(shortTypes.has(type) ? [type] : []),
    ];
  };
  const onOffer = [...new Map(plan.template.flatMap((s) => [...s.all.leaning, ...s.all.synergy, ...s.all.rest]).map((p) => [cardKey(p.card.name), p])).values()];
  const ranked = onOffer
    .filter((pick) => atCost(pick.card))
    .map((pick): Ranked => {
      const needs = needsOf(pick);
      return { pick, needs, fit: needs.length - (room(slotOf(pick.card.cmc)) <= 0 ? 1 : 0) };
    })
    .sort((a, b) => b.fit - a.fit || (b.pick.synergy ?? -1) - (a.pick.synergy ?? -1) || (b.pick.inclusion ?? 0) - (a.pick.inclusion ?? 0));

  const used = new Set<string>();
  const unused = <T extends { card: { name: string } }>(list: T[], limit: number) => {
    const chosen = list.filter((item) => !used.has(cardKey(item.card.name))).slice(0, limit);
    chosen.forEach((item) => used.add(cardKey(item.card.name)));
    return chosen;
  };
  const take = (fits: (pick: BuilderPick) => boolean) =>
    unused(
      ranked.map((r) => r.pick).filter(fits),
      PICKS,
    );
  const move = (type: string, over: number, picks: BuilderPick[], cuts: TypeMove["cuts"] = []): TypeMove[] => (picks.length + cuts.length > 0 ? [{ type, over, picks, cuts }] : []);

  const best = unused(
    ranked.filter((r) => r.fit >= SEVERAL).map((r) => ({ ...r.pick, reason: r.needs.join(" · ") })),
    BEST_PICKS,
  );

  const curve = curveSlots
    .filter((s) => Math.abs(room(s.slot)) > CLOSE_ENOUGH && (cost === undefined || s.slot === cost))
    .sort((a, b) => Math.abs(room(b.slot)) - Math.abs(room(a.slot)) || a.slot - b.slot)
    .flatMap((s) => {
      const over = -room(s.slot);
      const label = `${CURVE_LABELS[s.slot]} mana`;
      return over < 0 ? move(label, over, take((p) => slotOf(p.card.cmc) === s.slot)) : move(label, over, [], unused(leastPlayed(s.cards), over));
    });

  const landsShort = profile.curve.lands.count - profile.lands;
  const lands = cost === undefined && landsShort > 0 ? move("Lands", -landsShort, unused([...plan.lands.duals, ...plan.lands.fixing, ...plan.lands.utility], PICKS)) : [];

  const categories = CATEGORIES.filter((c) => (gaps[c] ?? 0) > 0)
    .sort((a, b) => gaps[b]! / CATEGORY_INFO[b].target - gaps[a]! / CATEGORY_INFO[a].target)
    .flatMap((c) => move(CATEGORY_INFO[c].label, -gaps[c]!, take((p) => p.categories.includes(c))));

  const threats = move("Threats", -threatsShort, take((p) => threatPicks.has(cardKey(p.card.name))));

  const cutOrder = leastPlayed(curveSlots.flatMap((s) => s.cards));
  const types = rows
    .filter((row) => row.type !== "Lands" && Math.abs(typeOver(row)) > CLOSE_ENOUGH)
    .flatMap((row) => {
      const over = typeOver(row);
      const ofType = (card: Parameters<typeof cardTypeOf>[0]) => cardTypeOf(card) === row.type;
      return over < 0 ? move(row.type, over, take((p) => ofType(p.card))) : move(row.type, over, [], unused(cutOrder.filter((c) => ofType(c.card) && atCost(c.card)), over));
    });

  return { best, moves: [...curve, ...lands, ...categories, ...threats, ...types] };
}
