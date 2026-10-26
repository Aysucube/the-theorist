import { describe, expect, it } from "vitest";
import type { CardDetails } from "@/lib/types";
import { cheapness, landTarget, manaCurve, slotOf } from "./curve";

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
