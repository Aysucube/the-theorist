import { describe, expect, it } from "vitest";
import { landFor } from "./land-art";

describe("landFor", () => {
  it("uses a basic land for one color and Wastes for none", () => {
    expect(landFor(["G"])).toBe("Forest");
    expect(landFor(["U"])).toBe("Island");
    expect(landFor([])).toBe("Wastes");
  });

  it("uses the original dual land for two colors, in any order", () => {
    expect(landFor(["G", "W"])).toBe("Savannah");
    expect(landFor(["W", "G"])).toBe("Savannah");
    expect(landFor(["B", "G"])).toBe("Bayou");
    expect(landFor(["U", "R"])).toBe("Volcanic Island");
  });

  it("picks one of the duals a three-color identity makes, the same one for the same commander", () => {
    const abzan = ["W", "B", "G"];
    const land = landFor(abzan, "Anafenza, the Foremost");
    expect(["Scrubland", "Savannah", "Bayou"]).toContain(land);
    expect(landFor(abzan, "Anafenza, the Foremost")).toBe(land);
    // Different commanders can get different duals.
    const seen = new Set(["Abzan Falconer", "Doran, the Siege Tower", "Anafenza, the Foremost", "Karador, Ghost Chieftain", "Ghave, Guru of Spores"].map((s) => landFor(abzan, s)));
    expect(seen.size).toBeGreaterThan(1);
  });
});
