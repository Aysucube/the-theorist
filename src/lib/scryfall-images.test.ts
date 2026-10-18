import { describe, expect, it } from "vitest";
import { scryfallImageAs } from "./scryfall-images";

describe("scryfallImageAs", () => {
  it("swaps the size in a Scryfall image link", () => {
    const small = "https://cards.scryfall.io/small/front/0/0/006ff5a3-355b-4a7d-b402-bb3c8d32a585.jpg?1785497593";
    expect(scryfallImageAs(small, "normal")).toBe(
      "https://cards.scryfall.io/normal/front/0/0/006ff5a3-355b-4a7d-b402-bb3c8d32a585.jpg?1785497593",
    );
    expect(scryfallImageAs(small, "art_crop")).toBe(
      "https://cards.scryfall.io/art_crop/front/0/0/006ff5a3-355b-4a7d-b402-bb3c8d32a585.jpg?1785497593",
    );
  });

  it("leaves other sites' images alone", () => {
    expect(scryfallImageAs("https://cdn.tcgph.com/cards/sol-ring.jpg", "normal")).toBeUndefined();
    expect(scryfallImageAs(undefined, "normal")).toBeUndefined();
  });
});
