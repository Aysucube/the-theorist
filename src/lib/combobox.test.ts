import { describe, expect, it } from "vitest";
import { moveHighlight, splitMatch } from "./combobox";

describe("moveHighlight", () => {
  it("steps down through the list and back to the text box", () => {
    expect(moveHighlight(-1, "down", 3)).toBe(0);
    expect(moveHighlight(0, "down", 3)).toBe(1);
    expect(moveHighlight(2, "down", 3)).toBe(-1);
  });

  it("steps up from the text box to the last suggestion", () => {
    expect(moveHighlight(-1, "up", 3)).toBe(2);
    expect(moveHighlight(1, "up", 3)).toBe(0);
    expect(moveHighlight(0, "up", 3)).toBe(-1);
  });

  it("stays on the text box when there are no suggestions", () => {
    expect(moveHighlight(-1, "down", 0)).toBe(-1);
    expect(moveHighlight(-1, "up", 0)).toBe(-1);
  });
});

describe("splitMatch", () => {
  it("splits around the typed text, ignoring case", () => {
    expect(splitMatch("Atraxa, Praetors' Voice", "atra")).toEqual(["", "Atra", "xa, Praetors' Voice"]);
    expect(splitMatch("Ixhel, Scion of Atraxa", "atra")).toEqual(["Ixhel, Scion of ", "Atra", "xa"]);
  });

  it("matches accented names typed without accents", () => {
    expect(splitMatch("Lim-Dûl's Vault", "dul")).toEqual(["Lim-", "Dûl", "'s Vault"]);
  });

  it("returns null when the typed text isn't in the name", () => {
    expect(splitMatch("Heat Ray", "atra")).toBeNull();
    expect(splitMatch("Sol Ring", "  ")).toBeNull();
  });
});
