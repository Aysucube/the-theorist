import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardLook } from "./card-look";

const saved = vi.hoisted(() => new Map<string, unknown>());
const started = vi.hoisted(() => [] as string[]);
vi.mock("./binder/card-cache", () => ({ savedDetails: async (name: string) => saved.get(name) }));
vi.mock("./image-loader", () => ({
  subscribeImage: (url: string) => {
    started.push(url);
    return () => {};
  },
}));

const look = (name: string): CardLook => ({ name, imageUrl: `https://cards.scryfall.io/normal/${name}.jpg`, typeLine: "Artifact", oracleText: "" });
const flush = () => new Promise((resolve) => setTimeout(resolve));

// The module remembers each card for the visit, so each test gets its own.
async function load() {
  vi.resetModules();
  return import("./card-look");
}

describe("card looks", () => {
  beforeEach(() => {
    saved.clear();
    started.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses what this browser already has, without asking the server", async () => {
    saved.set("Sol Ring", look("Sol Ring"));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { cardLook } = await load();
    expect(await cardLook("Sol Ring")).toEqual(look("Sol Ring"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks the server otherwise, once however many hovers there are", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(look("Sol Ring"))));
    vi.stubGlobal("fetch", fetch);
    const { cardLook } = await load();
    await Promise.all([cardLook("Sol Ring"), cardLook("Sol Ring")]);
    await cardLook("Sol Ring");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("has a card in hand once it's found, to open a hover card with", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(look("Sol Ring")))));
    const { cardLook, cardLookNow } = await load();
    expect(cardLookNow("Sol Ring")).toBeUndefined();
    await cardLook("Sol Ring");
    expect(cardLookNow("Sol Ring")?.name).toBe("Sol Ring");
  });

  it("asks again next time about a card it couldn't find", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const { cardLook } = await load();
    expect(await cardLook("Nope")).toBeUndefined();
    await cardLook("Nope");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gets the image coming before the hover card opens", async () => {
    saved.set("Sol Ring", look("Sol Ring"));
    const { prepareCardLook } = await load();
    prepareCardLook("Sol Ring");
    await flush();
    expect(started).toEqual(["https://cards.scryfall.io/normal/Sol Ring.jpg"]);
  });

  it("gets a chosen printing's image coming instead of the usual one", async () => {
    saved.set("Sol Ring", look("Sol Ring"));
    const { prepareCardLook } = await load();
    prepareCardLook("Sol Ring", "https://cards.scryfall.io/normal/chosen.jpg");
    await flush();
    expect(started).toEqual(["https://cards.scryfall.io/normal/chosen.jpg"]);
  });
});
