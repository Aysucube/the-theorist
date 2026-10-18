import { describe, expect, it, vi } from "vitest";
import { compareSnapshots } from "./local";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const meta = new Map([
  ["a", { name: "Spiking Card", setCode: "MH3", imageUrl: "https://cards.scryfall.io/normal/front/a/a/a.jpg" }],
  ["b", { name: "Steady Card", setCode: "CMM" }],
  ["c", { name: "New Printing", setCode: "FDN" }],
]);

describe("compareSnapshots", () => {
  it("finds surges against yesterday and last week, Commander-legal cards only", () => {
    const trends = compareSnapshots(
      "2026-10-18",
      { a: 900, b: 1000, c: 500, x: 5000 },
      meta,
      {
        "2026-10-17": { a: 600, b: 1000, x: 100 },
        "2026-10-11": { a: 300, b: 990 },
      },
    );
    expect(trends).toMatchObject({ source: "scryfall", pricesFrom: "2026-10-18" });
    expect(trends.windows.day).toEqual({
      since: "2026-10-17",
      cards: [{ name: "Spiking Card", setCode: "MH3", imageUrl: meta.get("a")!.imageUrl, fromUsd: 6, toUsd: 9, change: 0.5 }],
    });
    expect(trends.windows.week?.since).toBe("2026-10-11");
    expect(trends.windows.week?.cards.map((c) => c.name)).toEqual(["Spiking Card"]);
  });

  it("leaves a window out until there's a snapshot old enough", () => {
    const trends = compareSnapshots("2026-10-18", { a: 900 }, meta, { "2026-10-17": { a: 600 } });
    expect(Object.keys(trends.windows)).toEqual(["day"]);
    expect(compareSnapshots("2026-10-18", { a: 900 }, meta, {}).windows).toEqual({});
  });
});
