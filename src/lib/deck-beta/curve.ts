// The mana curve: how the deck's spells spread across mana values, and the
// land count that suits it. Lower is better: plenty of 1- and 2-drops means
// something to cast every turn from the start, and two spells in a turn soon
// after ("double-spelling"), which is what makes a deck steady and reliable.
// Pure, so it's easy to test.
import type { CardDetails } from "@/lib/types";

export const CURVE_LABELS = ["0–1", "2", "3", "4", "5", "6+"];
/**
 * A low, wide curve for the deck's spells: the share at each mana value
 * (0–1 through 6+). It averages about 3 mana a spell, with 4 in 10 spells
 * at 2 mana or less.
 */
export const CURVE_SHAPE = [0.16, 0.26, 0.23, 0.16, 0.1, 0.09];
/** The average mana value to stay at or under. */
export const AVERAGE_TARGET = 3;
/** The share of spells to have at 2 mana or less, for early plays and double-spelling. */
export const EARLY_SHARE = 0.4;

/** The template's land count, before the curve trims it. */
export const LANDS_BASE = 38;

export interface CurveReport {
  /** Spells at each mana value (0–1, 2, 3, 4, 5, 6+), copies counted. */
  counts: number[];
  /** What a low, wide curve would have at each, for the spells this deck should end up with. */
  targets: number[];
  spells: number;
  /** Average mana value of the spells (0 with none). */
  average: number;
  /** Spells at 2 mana or less, and how many a 99 with this many lands wants. */
  early: number;
  earlyTarget: number;
  /** More expensive than it should be: the average is high, or too many 5+ drops. */
  topHeavy: boolean;
  /** The land count that suits this curve. */
  lands: { count: number; why: string };
}

/** Which curve slot a mana value falls in (0 = 0–1 … 5 = 6+). */
export function slotOf(cmc: number): number {
  return Math.min(5, Math.max(0, Math.floor(cmc) - 1));
}

/**
 * Lands by the curve: 38 for a mid-range deck, 33 to 35 for a low curve
 * (cheap spells need less mana), 39 or 40 for a high one (so it isn't
 * mana-screwed), with 37 bridging low and mid.
 */
const LAND_STEPS: [below: number, lands: number, curve: string][] = [
  [2.3, 33, "a very low curve"],
  [2.6, 34, "a low curve"],
  [2.9, 35, "a low curve"],
  [3.1, 37, "a fairly low curve"],
  [3.6, 38, "a mid-range curve"],
  [4, 39, "a high curve"],
  [Infinity, 40, "a very high curve"],
];

export function landTarget(average: number | undefined): { count: number; why: string } {
  if (average === undefined || average === 0) {
    return { count: LANDS_BASE, why: `${LANDS_BASE} lands, the baseline for a mid-range deck, so you never miss your early land drops.` };
  }
  const [, count, curve] = LAND_STEPS.find(([below]) => average < below)!;
  const shown = average.toFixed(1);
  return {
    count,
    why:
      count < LANDS_BASE
        ? `Spells average ${shown} mana, ${curve}, so ${count} lands are enough.`
        : count > LANDS_BASE
          ? `Spells average ${shown} mana, ${curve}, so ${count} lands keep you from being mana-screwed.`
          : `Spells average ${shown} mana, ${curve}: ${count} lands keep your land drops coming.`,
  };
}

const isLand = (card: CardDetails) => /\bLand\b/.test(card.typeLine.split(" // ")[0]);

/**
 * The curve of a deck (or a deck in progress). The commander is left out: it
 * sits in the command zone, not in the 99. Targets are for the finished deck,
 * so an unfinished one shows how far each slot has to go.
 */
export function manaCurve(cards: { card: CardDetails; qty: number }[], commander?: string): CurveReport {
  const counts = [0, 0, 0, 0, 0, 0];
  let spells = 0;
  let total = 0;
  for (const { card, qty } of cards) {
    if (isLand(card) || card.name === commander) continue;
    counts[slotOf(card.cmc)] += qty;
    spells += qty;
    total += card.cmc * qty;
  }
  const average = spells ? total / spells : 0;
  const lands = landTarget(spells ? average : undefined);
  const plannedSpells = 99 - lands.count;
  const targets = CURVE_SHAPE.map((share) => Math.round(share * plannedSpells));
  const earlyTarget = Math.round(EARLY_SHARE * plannedSpells);
  const topHeavy = spells >= 10 && (average > AVERAGE_TARGET + 0.2 || counts[4] + counts[5] > targets[4] + targets[5] + 2);
  return { counts, targets, spells, average, early: counts[0] + counts[1], earlyTarget, topHeavy, lands };
}

/**
 * How much a card's mana value helps the curve, from 1 (0–1 mana) down to
 * negative for 6 or more. Recommendations add this, so cheap cards rise.
 */
export function cheapness(cmc: number): number {
  return [1, 0.8, 0.45, 0.15, -0.15, -0.35][slotOf(cmc)];
}
