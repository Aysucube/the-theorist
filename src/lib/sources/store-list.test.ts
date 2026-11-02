import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TcgphPrint } from "@/lib/types";
import { storeKey, storeList, type StoreCatalog } from "./store-list";

const files = vi.hoisted(() => new Map<string, string>());
vi.mock("node:fs/promises", () => ({
  mkdir: async () => {},
  readFile: async (file: string) => {
    const saved = files.get(file.replace(/\\/g, "/").split("/").pop()!);
    if (saved === undefined) throw new Error("no file");
    return saved;
  },
  writeFile: async (file: string, text: string) => void files.set(file.replace(/\\/g, "/").split("/").pop()!, text),
  rename: async (from: string, to: string) => {
    const name = (f: string) => f.replace(/\\/g, "/").split("/").pop()!;
    files.set(name(to), files.get(name(from))!);
    files.delete(name(from));
  },
}));

const print = (setName: string): TcgphPrint => ({ printId: setName, setName, url: "https://store.test", listings: [] });
const list = (setName: string): StoreCatalog => ({ "sol-ring": [print(setName)] });
const sets = (prints: TcgphPrint[]) => prints.map((p) => p.setName);

// Lists are held for the whole process, so each test needs a store of its own.
let id = 0;
const nextStore = () => `store-${++id}`;

describe("storeKey", () => {
  it("goes by the front face and ignores accents, so stores that name the back still match", () => {
    expect(storeKey("Jennifer Walters // The Sensational She-Hulk")).toBe(storeKey("Jennifer Walters"));
    expect(storeKey("Lim-Dûl's Vault")).toBe(storeKey("Lim-Dul's Vault"));
  });
});

describe("storeList", () => {
  beforeEach(() => {
    files.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("looks a card up by name, and has nothing for a card the store doesn't list", async () => {
    const lookup = storeList(nextStore(), async () => list("A"), 1000);
    expect(sets(await lookup("Sol Ring"))).toEqual(["A"]);
    expect(await lookup("Black Lotus")).toEqual([]);
  });

  it("reads the list once, however many lookups arrive together", async () => {
    const read = vi.fn(async () => list("A"));
    const lookup = storeList(nextStore(), read, 1000);
    await Promise.all([lookup("Sol Ring"), lookup("Sol Ring"), lookup("Sol Ring")]);
    await lookup("Sol Ring");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("shares a list between lookups made from different bundles", async () => {
    const store = nextStore();
    const read = vi.fn(async () => list("A"));
    await storeList(store, read, 1000)("Sol Ring");
    const again = storeList(store, read, 1000);
    expect(sets(await again("Sol Ring"))).toEqual(["A"]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("doesn't wait for a slow list, and has it once it arrives", async () => {
    let finish!: (catalog: StoreCatalog) => void;
    const lookup = storeList(nextStore(), () => new Promise<StoreCatalog>((resolve) => (finish = resolve)));
    expect(await lookup("Sol Ring")).toEqual([]);
    finish(list("A"));
    await new Promise((resolve) => setTimeout(resolve));
    expect(sets(await lookup("Sol Ring"))).toEqual(["A"]);
  });

  it("gives up waiting after its patience runs out", async () => {
    vi.useFakeTimers();
    const lookup = storeList(nextStore(), () => new Promise<StoreCatalog>(() => {}), 5000);
    const result = lookup("Sol Ring");
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual([]);
  });

  it("reads the list again when it's due, and answers from the old one meanwhile", async () => {
    vi.useFakeTimers();
    const read = vi.fn<() => Promise<StoreCatalog>>().mockResolvedValueOnce(list("Old")).mockResolvedValueOnce(list("New"));
    const lookup = storeList(nextStore(), read, 1000);
    expect(sets(await lookup("Sol Ring"))).toEqual(["Old"]);

    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
    await lookup("Sol Ring");
    expect(read).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(sets(await lookup("Sol Ring"))).toEqual(["Old"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(sets(await lookup("Sol Ring"))).toEqual(["New"]);
  });

  it("keeps the old list when a read fails, and leaves the store alone for a while", async () => {
    vi.useFakeTimers();
    const read = vi.fn<() => Promise<StoreCatalog>>().mockResolvedValueOnce(list("Old")).mockRejectedValue(new Error("down"));
    const lookup = storeList(nextStore(), read, 1000);
    await lookup("Sol Ring");
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
    await lookup("Sol Ring");
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);

    expect(sets(await lookup("Sol Ring"))).toEqual(["Old"]);
    await vi.advanceTimersByTimeAsync(60 * 1000);
    await lookup("Sol Ring");
    expect(read).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await lookup("Sol Ring");
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("starts from the computer's copy, without reading the store if it's recent", async () => {
    const store = nextStore();
    files.set(`${store}.json`, JSON.stringify({ readAt: Date.now() - 60_000, catalog: list("Saved") }));
    const read = vi.fn(async () => list("Fresh"));
    expect(sets(await storeList(store, read)("Sol Ring"))).toEqual(["Saved"]);
    expect(read).not.toHaveBeenCalled();
  });

  it("uses an old copy on the computer while it reads the store again", async () => {
    const store = nextStore();
    files.set(`${store}.json`, JSON.stringify({ readAt: Date.now() - 24 * 60 * 60 * 1000, catalog: list("Saved") }));
    const read = vi.fn(async () => list("Fresh"));
    const lookup = storeList(store, read);
    expect(sets(await lookup("Sol Ring"))).toEqual(["Saved"]);
    expect(read).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve));
    expect(sets(await lookup("Sol Ring"))).toEqual(["Fresh"]);
  });

  it("saves what it reads for next time", async () => {
    const store = nextStore();
    const lookup = storeList(store, async () => list("A"), 1000);
    await lookup("Sol Ring");
    await new Promise((resolve) => setTimeout(resolve));
    expect(JSON.parse(files.get(`${store}.json`)!).catalog).toEqual(list("A"));
  });
});
