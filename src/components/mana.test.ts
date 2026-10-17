import { describe, expect, it } from "vitest";
import { manaSymbols } from "./mana";

describe("manaSymbols", () => {
  it("splits a mana cost into its symbols", () => {
    expect(manaSymbols("{2}{U}{B}")).toEqual(["2", "U", "B"]);
    expect(manaSymbols("{X}{W/U}{B/P}")).toEqual(["X", "W/U", "B/P"]);
    expect(manaSymbols("")).toEqual([]);
  });
});
