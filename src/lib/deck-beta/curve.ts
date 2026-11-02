// The mana curve: how the deck's spells spread across mana values, and the
// land count that suits it. Each commander has its own curve: the deck aims for
// what its decks on EDHREC average, so a commander that wants big spells isn't
// told to cut them. Without those numbers it aims low: plenty of 1- and 2-drops
// means something to cast every turn from the start, and two spells in a turn
// soon after ("double-spelling"), which is what makes a deck steady and
// reliable. Pure, so it's easy to test.
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
/** The fewest lands a finished deck runs. */
export const MIN_LANDS = 30;
/** Spells a deck needs before its own curve says much about it. */
const SETTLED_SPELLS = 10;

/** The curve a commander's decks average on EDHREC. */
export interface CommanderCurve {
  /** Their spells at each mana value (0–1, 2, 3, 4, 5, 6+). */
  counts: number[];
  /** What those spells cost on average. */
  average: number;
}

/** A commander's curve from what EDHREC says of its decks, if it says enough. */
export function commanderCurve(decks: { curveCounts?: number[]; curveAverage?: number } | null | undefined): CommanderCurve | undefined {
  return decks?.curveCounts && decks.curveAverage !== undefined ? { counts: decks.curveCounts, average: decks.curveAverage } : undefined;
}

export interface CurveReport {
  /** Spells at each mana value (0–1, 2, 3, 4, 5, 6+), copies counted. */
  counts: number[];
  /** What the deck's spells should come to at each once it's finished: its commander's curve, or failing that a low, wide one. */
  targets: number[];
  /** The targets are this commander's own. */
  fromCommander: boolean;
  /** The average mana value to stay around. */
  averageTarget: number;
  spells: number;
  /** Average mana value of the spells (0 with none). */
  average: number;
  /** Spells at 2 mana or less, how many a finished deck wants, and that as a share of its spells. */
  early: number;
  earlyTarget: number;
  earlyShare: number;
  /** More expensive than it should be: the average is high, or too many 5+ drops. */
  topHeavy: boolean;
  /** The land count that suits this curve. */
  lands: { count: number; why: string };
}

/** Which curve slot a mana value falls in (0 = 0–1 … 5 = 6+). */
export function slotOf(cmc: number): number {
  return Math.min(5, Math.max(0, Math.floor(cmc) - 1));
}

/** Counts scaled to this total, in whole cards that add up. */
export function scaledCurve(counts: number[], spells: number): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((n) => (n / total) * spells);
  const out = exact.map(Math.floor);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  const left = spells - out.reduce((a, b) => a + b, 0);
  for (let k = 0; k < left; k++) out[order[k % order.length].i]++;
  return out;
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
 * so an unfinished one shows how far each slot has to go. With `aim`, they're
 * its commander's curve, for as many spells as the deck has room for: `lands`
 * says how many lands it's set to run, or a deck that has its lands already
 * keeps them.
 */
export function manaCurve(cards: { card: CardDetails; qty: number }[], commander?: string, { aim, lands: chosenLands }: { aim?: CommanderCurve; lands?: number } = {}): CurveReport {
  const counts = [0, 0, 0, 0, 0, 0];
  let spells = 0;
  let total = 0;
  let landsIn = 0;
  for (const { card, qty } of cards) {
    if (isLand(card)) landsIn += qty;
    if (isLand(card) || card.name === commander) continue;
    counts[slotOf(card.cmc)] += qty;
    spells += qty;
    total += card.cmc * qty;
  }
  const average = spells ? total / spells : 0;
  // A deck of a few cards says little about itself, so its commander's decks speak for it.
  const lands = landTarget(aim && spells < SETTLED_SPELLS ? aim.average : spells ? average : undefined);
  const plannedSpells = 99 - (chosenLands ?? (landsIn >= MIN_LANDS ? landsIn : lands.count));
  const targets = aim ? scaledCurve(aim.counts, plannedSpells) : CURVE_SHAPE.map((share) => Math.round(share * plannedSpells));
  const earlyTarget = aim ? targets[0] + targets[1] : Math.round(EARLY_SHARE * plannedSpells);
  const earlyShare = aim ? (aim.counts[0] + aim.counts[1]) / aim.counts.reduce((a, b) => a + b, 0) : EARLY_SHARE;
  const averageTarget = aim?.average ?? AVERAGE_TARGET;
  const topHeavy = spells >= SETTLED_SPELLS && (average > averageTarget + 0.2 || counts[4] + counts[5] > targets[4] + targets[5] + 2);
  return { counts, targets, fromCommander: Boolean(aim), averageTarget, spells, average, early: counts[0] + counts[1], earlyTarget, earlyShare, topHeavy, lands };
}

/**
 * How much a card's mana value helps the curve, from 1 (0–1 mana) down to
 * negative for 6 or more. Recommendations add this, so cheap cards rise.
 */
export function cheapness(cmc: number): number {
  return [1, 0.8, 0.45, 0.15, -0.15, -0.35][slotOf(cmc)];
}

/**
 * The same, for a deck with its commander's curve to go by: half that, and half
 * how much room the card's cost has left. A 6-drop rises where its commander's
 * decks play plenty of them, and sinks once this deck has enough.
 */
export function curveFit(cmc: number, curve?: CurveReport): number {
  if (!curve?.fromCommander) return cheapness(cmc);
  const slot = slotOf(cmc);
  const target = Math.max(1, curve.targets[slot]);
  return (cheapness(cmc) + Math.max(-1, (target - curve.counts[slot]) / target)) / 2;
}
