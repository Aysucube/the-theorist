import { describe, expect, it } from "vitest";
import { isSavedKey, isSavedValue, mergeBinders, mergeDeckLists, repairBinder } from "./saved-shape";

describe("saved values", () => {
  it("accepts only the binder and My Decks", () => {
    expect(isSavedKey("binder")).toBe(true);
    expect(isSavedKey("decks")).toBe(true);
    expect(isSavedKey("../secrets")).toBe(false);
  });

  it("checks each key's shape", () => {
    expect(isSavedValue("binder", [{ name: "Sol Ring", qty: 2 }])).toBe(true);
    expect(isSavedValue("binder", [{ name: "Sol Ring", qty: 0 }])).toBe(false);
    expect(isSavedValue("binder", { name: "Sol Ring" })).toBe(false);
    expect(isSavedValue("decks", [{ id: "a", name: "Elves", cards: [{ name: "Forest", qty: 30 }], savedAt: 1 }])).toBe(true);
    expect(isSavedValue("decks", [{ id: "a", name: "Elves" }])).toBe(false);
  });

  it("keeps the good cards of a damaged binder", () => {
    expect(repairBinder([{ name: "Sol Ring", qty: 1 }, { name: "", qty: 1 }, { name: "Forest", qty: 1.5 }, null])).toEqual([
      { name: "Sol Ring", qty: 1 },
    ]);
    expect(repairBinder("nope")).toBeUndefined();
  });
});

describe("merging copies", () => {
  it("keeps every card of two binders at the larger count", () => {
    expect(
      mergeBinders(
        [{ name: "Sol Ring", qty: 1 }, { name: "Forest", qty: 10 }],
        [{ name: "sol ring", qty: 3 }, { name: "Arcane Signet", qty: 1 }],
      ),
    ).toEqual([
      { name: "Arcane Signet", qty: 1 },
      { name: "Forest", qty: 10 },
      { name: "Sol Ring", qty: 3 },
    ]);
  });

  it("keeps every deck, preferring the first list's copy, newest first", () => {
    const a = [{ id: "x", name: "Mine", savedAt: 5 }];
    const b = [{ id: "x", name: "Old", savedAt: 1 }, { id: "y", name: "Other", savedAt: 9 }];
    expect(mergeDeckLists(a, b).map((d) => d.name)).toEqual(["Other", "Mine"]);
  });
});
