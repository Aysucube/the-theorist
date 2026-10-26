import { describe, expect, it } from "vitest";
import { linkPathname, transitionFor } from "./nav";

describe("transitionFor", () => {
  it("slides forward moving right along the nav, and back moving left", () => {
    expect(transitionFor("/", "/binder")).toBe("nav-forward");
    expect(transitionFor("/binder", "/shopping")).toBe("nav-forward");
    expect(transitionFor("/decks", "/deck")).toBe("nav-forward");
    expect(transitionFor("/shopping", "/")).toBe("nav-back");
    expect(transitionFor("/decks/abc123", "/market")).toBe("nav-forward");
    expect(transitionFor("/decks", "/decks/abc123")).toBe("nav-forward");
    expect(transitionFor("/shopping", "/market")).toBe("nav-back");
  });

  it("slides forward going deeper into a section, and back coming out", () => {
    expect(transitionFor("/decks", "/decks/new")).toBe("nav-forward");
    expect(transitionFor("/decks/new", "/decks")).toBe("nav-back");
    expect(transitionFor("/", "/card")).toBe("nav-forward");
    expect(transitionFor("/card", "/")).toBe("nav-back");
  });

  it("treats a card page as part of the front page's section", () => {
    expect(transitionFor("/card", "/binder")).toBe("nav-forward");
    expect(transitionFor("/decks/new", "/card")).toBe("nav-back");
  });

  it("crossfades on the same page, whatever the query", () => {
    expect(transitionFor("/card", "/card?q=Sol+Ring")).toBe("nav-fade");
    expect(transitionFor("/", "/?theme=elves#theme")).toBe("nav-fade");
    expect(transitionFor("/decks/", "/decks")).toBe("nav-fade");
  });
});

describe("linkPathname", () => {
  it("reads string and object hrefs", () => {
    expect(linkPathname("/decks/new", "/")).toBe("/decks/new");
    expect(linkPathname("/card?q=Sol%20Ring", "/")).toBe("/card");
    expect(linkPathname({ pathname: "/card", query: { q: "x" } } as { pathname: string }, "/")).toBe("/card");
    expect(linkPathname({ query: { theme: "elves" } } as { pathname?: string }, "/")).toBe("/");
    expect(linkPathname("?theme=elves", "/")).toBe("/");
  });

  it("ignores links that leave the app or stay on the page", () => {
    expect(linkPathname("https://scryfall.com", "/")).toBeUndefined();
    expect(linkPathname("mailto:a@b.c", "/")).toBeUndefined();
    expect(linkPathname("#theme", "/")).toBeUndefined();
  });
});
