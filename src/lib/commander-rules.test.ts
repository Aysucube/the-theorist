import { describe, expect, it } from "vitest";
import { canBeCommander } from "./commander-rules";

describe("canBeCommander", () => {
  it("accepts legendary creatures", () => {
    expect(canBeCommander({ typeLine: "Legendary Creature — Phyrexian Angel Horror", power: "4", toughness: "4" })).toBe(true);
  });

  it("accepts legendary Spacecraft and Vehicles with power and toughness", () => {
    expect(canBeCommander({ typeLine: "Legendary Artifact — Spacecraft", power: "6", toughness: "7" })).toBe(true); // Hearthhull, the Worldseed
    expect(canBeCommander({ typeLine: "Legendary Artifact — Vehicle", power: "5", toughness: "5" })).toBe(true);
  });

  it("rejects legendary cards without a power/toughness box, and non-legendary ones", () => {
    expect(canBeCommander({ typeLine: "Legendary Artifact" })).toBe(false); // The One Ring
    expect(canBeCommander({ typeLine: "Legendary Artifact — Spacecraft" })).toBe(false);
    expect(canBeCommander({ typeLine: "Artifact — Vehicle", power: "4", toughness: "3" })).toBe(false);
    expect(canBeCommander({ typeLine: "Creature — Elf Druid", power: "1", toughness: "1" })).toBe(false);
    expect(canBeCommander({ typeLine: "Land" })).toBe(false); // Westvale Abbey: only its back face is a legendary creature
  });

  it("accepts cards whose text says they can be your commander", () => {
    expect(
      canBeCommander({
        typeLine: "Legendary Planeswalker — Teferi",
        oracleText: "+1: ... Teferi, Temporal Archmage can be your commander.",
      }),
    ).toBe(true);
  });
});
