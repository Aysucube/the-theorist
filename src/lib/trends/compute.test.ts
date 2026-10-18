import { describe, expect, it } from "vitest";
import { addDays, dateOnOrBefore, scryfallImage, surge, topSurges } from "./compute.ts";

describe("surge", () => {
  it("counts real price jumps", () => {
    expect(surge(2, 3)).toBeCloseTo(0.5);
    expect(surge(0.5, 4)).toBeCloseTo(7);
  });

  it("ignores penny cards, tiny gains and small moves", () => {
    expect(surge(0.1, 2.5)).toBeNull(); // was under 25 cents
    expect(surge(1, 1.8)).toBeNull(); // still under $2
    expect(surge(9.8, 10.2)).toBeNull(); // only 40 cents
    expect(surge(20, 21)).toBeNull(); // only 5%
    expect(surge(5, 4)).toBeNull(); // went down
  });
});

describe("dates", () => {
  it("steps back by days across months", () => {
    expect(addDays("2026-10-03", -7)).toBe("2026-09-26");
  });

  it("finds the latest price on or before a day, within limits", () => {
    const dates = ["2026-10-01", "2026-10-08", "2026-10-10", "2026-10-11"];
    expect(dateOnOrBefore(dates, "2026-10-09", "2026-10-05")).toBe("2026-10-08");
    expect(dateOnOrBefore(dates, "2026-10-07", "2026-10-05")).toBeUndefined();
  });
});

describe("topSurges", () => {
  it("keeps each card's biggest surge, biggest first", () => {
    const top = topSurges([
      { name: "A", fromUsd: 2, toUsd: 3, change: 0.5 },
      { name: "B", fromUsd: 1, toUsd: 4, change: 3 },
      { name: "A", fromUsd: 1, toUsd: 3, change: 2, setCode: "OLD" },
    ]);
    expect(top.map((c) => `${c.name}:${c.change}`)).toEqual(["B:3", "A:2"]);
    expect(top[1].setCode).toBe("OLD");
  });
});

describe("scryfallImage", () => {
  it("builds Scryfall's image link from an id", () => {
    expect(scryfallImage("4f152dd9-2b35-45b2-90fe-8c71d0634226")).toBe(
      "https://cards.scryfall.io/normal/front/4/f/4f152dd9-2b35-45b2-90fe-8c71d0634226.jpg",
    );
  });
});
