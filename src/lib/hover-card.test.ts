import { describe, expect, it } from "vitest";
import { placeHoverCard } from "./hover-card";

const viewport = { width: 1280, height: 800 };
const card = { width: 224, height: 420 };
const point = (x: number, y: number) => ({ left: x, right: x, top: y, bottom: y });

describe("placeHoverCard", () => {
  it("sits just right of the pointer", () => {
    expect(placeHoverCard(point(300, 400), viewport, card)).toEqual({ left: 312, top: 260 });
  });

  it("flips to the left of the pointer near the right edge", () => {
    const { left } = placeHoverCard(point(1200, 400), viewport, card);
    expect(left).toBe(1200 - 12 - 224);
  });

  it("stays inside the window at the top and bottom", () => {
    expect(placeHoverCard(point(300, 20), viewport, card).top).toBe(12);
    expect(placeHoverCard(point(300, 790), viewport, card).top).toBe(800 - 420 - 12);
  });

  it("keeps a margin on a narrow screen where neither side fits", () => {
    const { left } = placeHoverCard(point(150, 400), { width: 300, height: 800 }, card);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(left + card.width).toBeLessThanOrEqual(300);
  });
});
