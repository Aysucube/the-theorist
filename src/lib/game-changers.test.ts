import { describe, expect, it } from "vitest";
import { gameChangerKeys, isGameChangerIn } from "./game-changers";

describe("isGameChangerIn", () => {
  const keys = gameChangerKeys(["Rhystic Study", "Tergrid, God of Fright // Tergrid's Lantern"]);

  it("matches names ignoring case and spacing", () => {
    expect(isGameChangerIn(keys, "rhystic study ")).toBe(true);
    expect(isGameChangerIn(keys, "Sol Ring")).toBe(false);
  });

  it("matches a double-faced card by its full name or a face", () => {
    expect(isGameChangerIn(keys, "Tergrid, God of Fright // Tergrid's Lantern")).toBe(true);
    expect(isGameChangerIn(keys, "Tergrid, God of Fright")).toBe(true);
  });
});
