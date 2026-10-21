import { describe, expect, it } from "vitest";
import type { Combo } from "@/lib/types";
import { byImpact, cardsMentioned, walkSteps } from "./walkthrough";

const monolith: Combo = {
  id: "1",
  cards: ["Basalt Monolith", "Rings of Brighthearth"],
  templates: [],
  results: ["Infinite colorless mana"],
  steps:
    "Activate Basalt Monolith's first ability by tapping it, adding {C}{C}{C}.\nActivate Basalt Monolith's last ability by paying {3}.\nRings of Brighthearth triggers, causing you to pay {2} to copy Basalt Monolith's ability.\nRepeat.",
  prerequisites: "",
  manaNeeded: "{2}",
  popularity: 50000,
  url: "",
};

describe("walkSteps", () => {
  it("walks from setting up, through each step, to the result", () => {
    const steps = walkSteps(monolith);
    expect(steps.map((s) => s.title)).toEqual(["Set up", "Step 1", "Step 2", "Step 3", "Step 4", "Result"]);
    expect(steps[0].text).toMatch(/You need Basalt Monolith \+ Rings of Brighthearth/);
    expect(steps[0].text).toMatch(/Mana needed: \{2\}/);
    expect(steps.at(-1)!.text).toBe("Infinite colorless mana");
  });

  it("knows which cards each step is about", () => {
    const steps = walkSteps(monolith);
    expect(steps[1].cards).toEqual(["Basalt Monolith"]);
    expect(steps[3].cards).toEqual(["Basalt Monolith", "Rings of Brighthearth"]);
    // A step naming no card is about all of them.
    expect(steps[4].cards).toEqual(monolith.cards);
  });
});

describe("cardsMentioned", () => {
  it("finds cards by short name and by front face", () => {
    expect(cardsMentioned("Atraxa proliferates.", ["Atraxa, Praetors' Voice", "Sol Ring"])).toEqual(["Atraxa, Praetors' Voice"]);
    expect(cardsMentioned("Cast Fire on yourself.", ["Fire // Ice"])).toEqual(["Fire // Ice"]);
  });
});

describe("byImpact", () => {
  it("puts infinite combos and wins first", () => {
    const value = { ...monolith, id: "2", results: ["Draw two cards"], popularity: 99999 };
    expect([value, monolith].sort(byImpact).map((c) => c.id)).toEqual(["1", "2"]);
  });
});
