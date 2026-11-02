import { afterEach, describe, expect, it, vi } from "vitest";
import { backOf, isTurned, isTwoSided, rightClickTurns, turnOver } from "./card-faces";

const normal = "https://cards.scryfall.io/normal/front/6/a/6aef77b3.jpg?1562";
const small = "https://cards.scryfall.io/small/front/6/a/6aef77b3.jpg?1562";
const served = "/card-image/normal/front/6/a/6aef77b3.jpg?1562";
const other = "https://cards.scryfall.io/normal/front/1/2/12345678.jpg?1";

describe("two-sided cards", () => {
  afterEach(() => {
    if (isTurned(normal)) turnOver(normal);
    if (isTurned(other)) turnOver(other);
  });

  it("knows which layouts have a back", () => {
    expect(["transform", "modal_dfc"].every(isTwoSided)).toBe(true);
    expect(["normal", "split", "adventure", "flip", "meld"].some(isTwoSided)).toBe(false);
    expect(isTwoSided(undefined)).toBe(false);
  });

  it("finds a printing's back beside its front", () => {
    expect(backOf(normal)).toBe("https://cards.scryfall.io/normal/back/6/a/6aef77b3.jpg?1562");
    expect(backOf(served)).toBe("/card-image/normal/back/6/a/6aef77b3.jpg?1562");
  });

  it("turns a printing over at every size, and back again", () => {
    turnOver(small);
    expect(isTurned(normal)).toBe(true);
    expect(isTurned(served)).toBe(true);
    expect(isTurned(backOf(normal))).toBe(true);
    turnOver(backOf(normal));
    expect(isTurned(small)).toBe(false);
  });

  it("leaves other printings alone", () => {
    turnOver(normal);
    expect(isTurned(other)).toBe(false);
  });

  it("turns several images the same way, even if one was already over", () => {
    turnOver(normal);
    turnOver(normal, other);
    expect(isTurned(normal)).toBe(false);
    expect(isTurned(other)).toBe(false);
  });

  it("ignores images from elsewhere", () => {
    turnOver("https://example.com/card.jpg", undefined, null);
    expect(isTurned("https://example.com/card.jpg")).toBe(false);
  });

  it("takes the place of the browser's menu only for a card with another side", () => {
    const event = { preventDefault: vi.fn() };
    rightClickTurns("normal", normal)(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(isTurned(normal)).toBe(false);
    rightClickTurns("transform", "https://example.com/card.jpg")(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    rightClickTurns("transform", normal)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(isTurned(normal)).toBe(true);
  });
});
