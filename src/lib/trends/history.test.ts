import { describe, expect, it } from "vitest";
import { findMovers, resolveDays } from "./history";

const meta = new Map([
  ["a", { name: "Rocket", setCode: "MH3" }],
  ["a2", { name: "Rocket", setCode: "PLST" }],
  ["b", { name: "Slow Climber", setCode: "CMM" }],
  ["c", { name: "Crasher", setCode: "FDN" }],
  ["d", { name: "Bulk", setCode: "FDN" }],
  ["e", { name: "Pricey Steady", setCode: "LEA" }],
]);
const from = { a: 200, a2: 400, b: 1000, c: 3000, d: 10, e: 50000, x: 100 };
const to = { a: 900, a2: 500, b: 1600, c: 1200, d: 40, e: 50050, x: 900 };

describe("findMovers", () => {
  it("lists rises by percentage, one per card, skipping bulk and unknown printings", () => {
    const up = findMovers(from, to, meta, { direction: "up", sort: "pct", minUsd: 2, limit: 10 });
    expect(up.map((m) => m.name)).toEqual(["Rocket", "Slow Climber", "Pricey Steady"]);
    expect(up[0]).toMatchObject({ id: "a", setCode: "MH3", fromUsd: 2, toUsd: 9, diffUsd: 7 });
    expect(up[0].change).toBeCloseTo(3.5);
  });

  it("can rank by dollars instead", () => {
    const up = findMovers(from, to, meta, { direction: "up", sort: "usd", minUsd: 2, limit: 10 });
    expect(up.map((m) => m.name)).toEqual(["Rocket", "Slow Climber", "Pricey Steady"]);
    const byDollars = findMovers(from, { ...to, e: 51500 }, meta, { direction: "up", sort: "usd", minUsd: 2, limit: 1 });
    expect(byDollars[0].name).toBe("Pricey Steady");
  });

  it("lists falls too", () => {
    const down = findMovers(from, to, meta, { direction: "down", sort: "pct", minUsd: 2, limit: 10 });
    expect(down.map((m) => m.name)).toEqual(["Crasher"]);
    expect(down[0].diffUsd).toBe(-18);
    expect(down[0].change).toBeCloseTo(-0.6);
  });
});

describe("resolveDays", () => {
  const dates = ["2026-10-01", "2026-10-05", "2026-10-09"];

  it("defaults to the whole stored history", () => {
    expect(resolveDays(dates)).toEqual({ from: "2026-10-01", to: "2026-10-09" });
  });

  it("keeps valid choices and fixes unknown or backwards ones", () => {
    expect(resolveDays(dates, "2026-10-05", "2026-10-09")).toEqual({ from: "2026-10-05", to: "2026-10-09" });
    expect(resolveDays(dates, "2026-12-25", "2026-10-05")).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(resolveDays(dates, "2026-10-09", "2026-10-05")).toEqual({ from: "2026-10-01", to: "2026-10-05" });
  });

  it("needs two days", () => {
    expect(resolveDays(["2026-10-01"])).toEqual({ from: undefined, to: "2026-10-01" });
    expect(resolveDays([])).toEqual({ from: undefined, to: undefined });
  });
});
