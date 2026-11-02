import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { cheapness, commanderCurve, curveFit, landTarget, manaCurve, slotOf } from "./curve";

const card = (name: string, cmc: number, typeLine = "Creature — Elf"): CardDetails => ({
  name,
  typeLine,
  oracleText: "",
  colorIdentity: [],
  layout: "normal",
  keywords: [],
  cmc,
});

describe("mana curve", () => {
  it("puts mana values in slots, 0–1 through 6+", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(slotOf)).toEqual([0, 0, 1, 2, 3, 4, 5, 5]);
  });

  it("counts spells by mana value, leaving out lands and the commander", () => {
    const curve = manaCurve(
      [
        { card: card("Lathril, Blade of the Elves", 4, "Legendary Creature — Elf Noble"), qty: 1 },
        { card: card("Llanowar Elves", 1), qty: 1 },
        { card: card("Elvish Mystic", 1), qty: 1 },
        { card: card("Elvish Archdruid", 2), qty: 1 },
        { card: card("Craterhoof Behemoth", 8), qty: 1 },
        { card: card("Forest", 0, "Basic Land — Forest"), qty: 30 },
      ],
      "Lathril, Blade of the Elves",
    );
    expect(curve.counts).toEqual([2, 1, 0, 0, 0, 1]);
    expect(curve.spells).toBe(4);
    expect(curve.average).toBe(3);
    expect(curve.early).toBe(3);
  });

  it("aims for 38 lands at mid-range, 33 to 35 for a low curve, more for a high one", () => {
    expect(landTarget(undefined).count).toBe(38);
    expect(landTarget(3.3).count).toBe(38);
    expect(landTarget(3).count).toBe(37);
    expect(landTarget(2.8).count).toBe(35);
    expect(landTarget(2.4).count).toBe(34);
    expect(landTarget(2.1).count).toBe(33);
    expect(landTarget(3.8).count).toBe(39);
    expect(landTarget(4.3).count).toBe(40);
  });

  it("sets targets for the finished deck, a low and wide curve", () => {
    const curve = manaCurve([{ card: card("Sol Ring", 1, "Artifact"), qty: 1 }]);
    expect(curve.targets.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(60);
    expect(curve.targets[1]).toBeGreaterThan(curve.targets[4]);
    expect(curve.earlyTarget).toBeGreaterThanOrEqual(24);
  });

  it("calls a deck with too many expensive spells top-heavy", () => {
    const heavy = manaCurve(Array.from({ length: 30 }, (_, i) => ({ card: card(`Big ${i}`, i < 15 ? 6 : 3), qty: 1 })));
    const light = manaCurve(Array.from({ length: 30 }, (_, i) => ({ card: card(`Small ${i}`, i < 15 ? 1 : 2), qty: 1 })));
    expect(heavy.topHeavy).toBe(true);
    expect(light.topHeavy).toBe(false);
  });

  it("scores cheap cards up and expensive ones down", () => {
    expect(cheapness(1)).toBeGreaterThan(cheapness(2));
    expect(cheapness(2)).toBeGreaterThan(cheapness(4));
    expect(cheapness(7)).toBeLessThan(0);
  });
});

describe("a commander's own curve", () => {
  const spells = (n: number, cmc: number) => Array.from({ length: n }, (_, i) => ({ card: card(`${cmc}-drop ${i}`, cmc), qty: 1 }));
  /** An Ur-Dragon sort of deck: its spells average over 4 mana, with plenty at 6 and up. */
  const big = { counts: [4, 8, 10, 12, 13, 16], average: 4.2 };
  const small = { counts: [20, 22, 12, 5, 2, 1], average: 2.1 };

  it("reads EDHREC's numbers, or nothing when they're not there", () => {
    expect(commanderCurve({ curveCounts: big.counts, curveAverage: big.average })).toEqual(big);
    expect(commanderCurve({ curveAverage: 3 })).toBeUndefined();
    expect(commanderCurve(null)).toBeUndefined();
  });

  it("aims for the commander's curve, for as many spells as the deck has room", () => {
    const curve = manaCurve([], undefined, { aim: big, lands: 36 });
    expect(curve.fromCommander).toBe(true);
    expect(curve.targets.reduce((a, b) => a + b, 0)).toBe(63);
    expect(curve.targets[5]).toBeGreaterThan(curve.targets[0]);
    expect(manaCurve([]).fromCommander).toBe(false);
  });

  it("gives two commanders two different curves", () => {
    const [high, low] = [big, small].map((aim) => manaCurve([], undefined, { aim, lands: 37 }));
    expect(high.targets[5]).toBeGreaterThan(low.targets[5]);
    expect(high.earlyTarget).toBeLessThan(low.earlyTarget);
    expect(high.averageTarget).toBeGreaterThan(low.averageTarget);
  });

  it("wants as many early plays as the commander's decks have", () => {
    const curve = manaCurve([], undefined, { aim: big, lands: 36 });
    expect(curve.earlyTarget).toBe(curve.targets[0] + curve.targets[1]);
    expect(curve.earlyShare).toBeCloseTo(12 / 63, 5);
  });

  it("doesn't call a deck top-heavy for matching a top-heavy commander", () => {
    const deck = [...spells(4, 1), ...spells(8, 2), ...spells(10, 3), ...spells(12, 4), ...spells(13, 5), ...spells(16, 6)];
    expect(manaCurve(deck).topHeavy).toBe(true);
    expect(manaCurve(deck, undefined, { aim: big }).topHeavy).toBe(false);
  });

  it("calls the same deck top-heavy for a low commander", () => {
    const deck = [...spells(10, 2), ...spells(10, 3), ...spells(10, 4)];
    expect(manaCurve(deck).topHeavy).toBe(false);
    expect(manaCurve(deck, undefined, { aim: small }).topHeavy).toBe(true);
  });

  it("uses the commander's average for lands until the deck has spells of its own", () => {
    expect(manaCurve([], undefined, { aim: big }).lands.count).toBe(40);
    expect(manaCurve(spells(2, 1), undefined, { aim: big }).lands.count).toBe(40);
    expect(manaCurve(spells(20, 2), undefined, { aim: big }).lands.count).toBe(33);
  });

  it("keeps a finished deck's lands, but not a handful in a deck still coming together", () => {
    const lands = (n: number) => [{ card: card("Forest", 0, "Basic Land — Forest"), qty: n }];
    expect(manaCurve(lands(36), undefined, { aim: big }).targets.reduce((a, b) => a + b, 0)).toBe(63);
    expect(manaCurve(lands(5), undefined, { aim: big }).targets.reduce((a, b) => a + b, 0)).toBe(59);
  });

  it("lifts the costs a commander plays that the deck is short of, and sinks the ones past the line", () => {
    const short = manaCurve([], undefined, { aim: big, lands: 36 });
    const full = manaCurve(spells(30, 6), undefined, { aim: big, lands: 36 });
    expect(curveFit(6, short)).toBeGreaterThan(cheapness(6));
    expect(curveFit(6, full)).toBeLessThan(curveFit(6, short));
    expect(curveFit(6, full)).toBeLessThan(curveFit(2, full));
  });

  it("goes by cost alone without a commander's curve", () => {
    expect(curveFit(6)).toBe(cheapness(6));
    expect(curveFit(6, manaCurve([]))).toBe(cheapness(6));
  });
});
