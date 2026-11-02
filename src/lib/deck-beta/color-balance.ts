// Balancing a deck's colors: which lands to bring in, and what to cut for them,
// so each color's share of what the lands make meets its share of what the
// spells ask for. Fixing lands go in first, while the mana base has room for
// them (the template's count for the deck's colors), and basics finish the job.
// Whole lands can't always hit a share exactly, so it stops once no swap helps.
// Pure, so it's easy to test.
import type { CardDetails } from "@/lib/types";
import { colorDistribution, isLandCard, LAND_KIND_LABEL, landFit, landKind, landSources, manaBasePlan, type ColorDistribution } from "./lands";
import { cardKey } from "./recommend";

export const DECK_SIZE = 100;
/** A swap has to close the gap by this much of the deck's mana to be worth making. */
const MIN_GAIN = 0.005;
/** Spells offered as other cuts, besides the deck's lands. */
const SPELL_OPTIONS = 8;

const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
/** The basic land of each color. */
export const BASIC_OF: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

type DeckLine = { card: CardDetails; qty: number };

/** A card that could leave the deck, and why. */
export interface BalanceCut {
  card: CardDetails;
  why: string;
}

export interface ColorSwap {
  add: CardDetails;
  /** The deck's colors it makes. */
  makes: string[];
  /** The kind of land it is. */
  label: string;
  /** What makes room for it; nothing while the deck has space. */
  cut?: BalanceCut;
}

export interface ColorBalance {
  swaps: ColorSwap[];
  /** Everything that could make room, lands first. */
  cuts: BalanceCut[];
}

export interface BalanceInput {
  cards: DeckLine[];
  identity: string[];
  /** Lands to choose from, the best first; any already in the deck are skipped. */
  lands: CardDetails[];
  /** One of each basic land in the deck's colors. */
  basics: CardDetails[];
  /** Copies in the binder: what you own goes in first. */
  owned: (name: string) => number;
  commander?: string;
  /** How many lands the deck wants: a spell only makes way for a land below this. */
  landTarget: number;
  /** Spells that could go when no land can, the first to cut at the front. */
  spellCuts?: BalanceCut[];
}

/** How far a deck's lands are from its spells: the share of its mana in the wrong color. */
export function colorGap({ colors }: ColorDistribution): number {
  return colors.reduce((sum, c) => sum + Math.abs(c.pipShare - c.sourceShare), 0) / 2;
}

/** Whether every color is within a land of what its spells ask for. */
export function isBalanced({ colors }: ColorDistribution): boolean {
  return colors.every((c) => Math.abs(c.short) <= 1);
}

/** The swaps that bring a deck's lands closest to its spells, with what each one cuts. */
export function balanceColors({ cards, identity, lands, basics, owned, commander, landTarget, spellCuts = [] }: BalanceInput): ColorBalance {
  const { colors } = colorDistribution(cards, identity);
  const own = colors.map((c) => c.color);
  const vectorOf = (card: CardDetails) => {
    const makes = landSources(card, own);
    return own.map((c) => Number(makes.includes(c)));
  };
  const gapOf = (sources: number[]) => {
    const total = sources.reduce((a, b) => a + b, 0);
    return colors.reduce((sum, c, i) => sum + Math.abs(c.pipShare - (total ? sources[i] / total : 0)), 0) / 2;
  };

  const deckLands = cards.filter(({ card }) => isLandCard(card) && card.name !== commander);
  const whyCut = (card: CardDetails) => {
    const kind = landKind(card);
    if (kind === "basic") {
      const extra = colors.find((c) => c.short < 0 && landSources(card, own).includes(c.color));
      return extra ? `${COLOR_NAMES[extra.color]} makes more than your spells ask for` : "Basic land";
    }
    if (landSources(card, own).length === 0) return "Makes none of your colors";
    return kind === "tapped" ? "Always enters tapped" : undefined;
  };
  const landCuts = deckLands.flatMap(({ card }): BalanceCut[] => {
    const why = whyCut(card);
    return why ? [{ card, why }] : [];
  });
  const stock = new Map(deckLands.map(({ card, qty }) => [card.name, qty]));

  const inDeck = new Set(cards.map(({ card }) => cardKey(card.name)));
  const fixers = [...new Map(lands.map((card) => [cardKey(card.name), card])).values()].filter((card) => {
    const kind = landKind(card);
    return kind !== undefined && !inDeck.has(cardKey(card.name)) && landSources(card, own).length >= 2 && landFit(kind, own.length) > 0;
  });
  // Your own lands first, then the better land for this many colors; the lands' own order settles the rest.
  const worth = (card: CardDetails) => (owned(card.name) > 0 ? 0.01 : 0) + landFit(landKind(card) ?? "other", own.length) * 0.005;

  let sources = colors.map((c) => c.sources);
  let size = cards.reduce((sum, { qty }) => sum + qty, 0);
  let landCount = deckLands.reduce((sum, { qty }) => sum + qty, 0);
  let nonbasics = deckLands.reduce((sum, { card, qty }) => sum + (landKind(card) === "basic" ? 0 : qty), 0);
  const { nonbasics: nonbasicRoom, utilityRoom } = manaBasePlan(own.length, landCount);
  const makesNothing = (card: CardDetails) => landSources(card, own).length === 0;
  // Lands that make none of the deck's colors earn their place another way: only those past what the template has room for are offered up.
  let spareUtility = deckLands.reduce((sum, { card, qty }) => sum + (makesNothing(card) ? qty : 0), 0) - utilityRoom;
  let spellsCut = 0;
  const swaps: ColorSwap[] = [];
  const used = new Set<string>();

  const bestMove = (adds: CardDetails[], cuts: (BalanceCut | undefined)[]) => {
    const now = gapOf(sources);
    let best: { add: CardDetails; cut?: BalanceCut; score: number } | undefined;
    for (const add of adds) {
      const added = vectorOf(add);
      for (const cut of cuts) {
        if (cut?.card.name === add.name) continue;
        const taken = cut && isLandCard(cut.card) ? vectorOf(cut.card) : own.map(() => 0);
        const gain = now - gapOf(sources.map((n, i) => n + added[i] - taken[i]));
        const score = gain + worth(add) + (cut && landKind(cut.card) === "tapped" ? 0.004 : 0);
        if (gain >= MIN_GAIN && (!best || score > best.score)) best = { add, cut, score };
      }
    }
    return best;
  };

  // Every color is as close to its share as whole lands can get.
  const settled = () => {
    const total = sources.reduce((a, b) => a + b, 0);
    return colors.every((c, i) => Math.round(c.pipShare * total - sources[i]) === 0);
  };

  const run = (adds: () => CardDetails[], open: () => boolean) => {
    while (open() && !settled()) {
      const lands = landCuts.filter((c) => (stock.get(c.card.name) ?? 0) > 0 && (spareUtility > 0 || !makesNothing(c.card)));
      const spell = landCount < landTarget ? spellCuts[spellsCut] : undefined;
      const room = size < DECK_SIZE && landCount < landTarget;
      const move = room ? bestMove(adds(), [undefined]) : (bestMove(adds(), lands) ?? (spell ? bestMove(adds(), [spell]) : undefined));
      if (!move) return;
      const { add, cut } = move;
      const taken = cut && isLandCard(cut.card) ? vectorOf(cut.card) : own.map(() => 0);
      const added = vectorOf(add);
      sources = sources.map((n, i) => n + added[i] - taken[i]);
      if (cut === undefined) size++;
      if (cut && stock.has(cut.card.name)) {
        stock.set(cut.card.name, stock.get(cut.card.name)! - 1);
        if (landKind(cut.card) !== "basic") nonbasics--;
        if (makesNothing(cut.card)) spareUtility--;
      } else {
        landCount++;
        if (cut) spellsCut++;
      }
      if (landKind(add) !== "basic") {
        nonbasics++;
        used.add(add.name);
      }
      swaps.push({ add, cut, makes: landSources(add, own), label: LAND_KIND_LABEL[landKind(add) ?? "other"] });
    }
  };
  if (own.length >= 2) {
    run(
      () => fixers.filter((card) => !used.has(card.name)),
      () => nonbasics < nonbasicRoom,
    );
    run(
      () => basics,
      () => true,
    );
  }
  return { swaps, cuts: [...landCuts, ...spellCuts.slice(0, SPELL_OPTIONS)] };
}

/** The same swap made several times, as one line. */
export interface SwapGroup extends ColorSwap {
  count: number;
}

/** Swaps side by side, the same land for the same cut read as one. */
export function groupSwaps(swaps: ColorSwap[]): SwapGroup[] {
  const groups = new Map<string, SwapGroup>();
  for (const swap of swaps) {
    const key = `${swap.add.name}|${swap.cut?.card.name}`;
    const seen = groups.get(key);
    groups.set(key, seen ? { ...seen, count: seen.count + 1 } : { ...swap, count: 1 });
  }
  return [...groups.values()];
}

/** The deck once these swaps are made. */
export function afterSwaps(cards: DeckLine[], swaps: Pick<ColorSwap, "add" | "cut">[]): DeckLine[] {
  const lines = new Map(cards.map((line) => [line.card.name, line]));
  for (const { add, cut } of swaps) {
    lines.set(add.name, { card: add, qty: (lines.get(add.name)?.qty ?? 0) + 1 });
    const gone = cut && lines.get(cut.card.name);
    if (!gone) continue;
    if (gone.qty > 1) lines.set(gone.card.name, { ...gone, qty: gone.qty - 1 });
    else lines.delete(gone.card.name);
  }
  return [...lines.values()];
}
