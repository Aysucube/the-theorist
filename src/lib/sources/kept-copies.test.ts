import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keptCopies } from "./kept-copies";

const files = vi.hoisted(() => new Map<string, Buffer>());
const saving = vi.hoisted(() => ({ on: true }));
/** A file by its folder and name, e.g. "kept-1/page.json.gz". */
const name = (file: string) => file.replace(/\\/g, "/").split("/").slice(-2).join("/");
vi.mock("node:fs/promises", () => ({
  mkdir: async () => {},
  readFile: async (file: string) => {
    const saved = files.get(name(file));
    if (!saved) throw new Error("no file");
    return saved;
  },
  writeFile: async (file: string, data: Buffer) => void files.set(name(file), Buffer.from(data)),
  rename: async (from: string, to: string) => {
    files.set(name(to), files.get(name(from))!);
    files.delete(name(from));
  },
  readdir: async (dir: string) => {
    const folder = dir.replace(/\\/g, "/").split("/").pop();
    return [...files.keys()].filter((f) => f.startsWith(`${folder}/`)).map((f) => f.split("/")[1]);
  },
  stat: async () => ({ mtimeMs: Date.now() }),
  rm: async (file: string) => void files.delete(name(file)),
}));
vi.mock("@/lib/saved-data", () => ({ savingOnComputer: () => saving.on }));

const HOUR = 60 * 60 * 1000;
const RULES = { freshMs: 24 * HOUR, keepMs: 30 * 24 * HOUR };

// Copies and lookups in progress are shared by the whole process, so each test keeps to its own folder.
let n = 0;
let folder = "";
const nextFolder = () => (folder = `kept-${++n}`);

const fileOf = (key: string) => `${folder}/${encodeURIComponent(key)}.json.gz`;
/** A copy saved some hours ago, as the computer would have it. */
const saveCopy = (key: string, value: unknown, hoursAgo: number) =>
  files.set(fileOf(key), gzipSync(JSON.stringify({ savedAt: Date.now() - hoursAgo * HOUR, value })));

describe("keptCopies", () => {
  beforeEach(() => {
    files.clear();
    saving.on = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks the source once and answers from the copy after that", async () => {
    const keep = keptCopies(nextFolder(), RULES);
    const fetch = vi.fn(async () => ({ cards: ["Sol Ring"] }));

    expect(await keep("cards/sol-ring", fetch)).toEqual({ cards: ["Sol Ring"] });
    await vi.waitFor(() => expect(files.has(fileOf("cards/sol-ring"))).toBe(true));
    expect(await keep("cards/sol-ring", fetch)).toEqual({ cards: ["Sol Ring"] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("answers at once from a day-old copy while it reads a new one", async () => {
    const keep = keptCopies(nextFolder(), RULES);
    saveCopy("page", "yesterday", 30);
    let finish!: (value: string) => void;
    const fetch = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));

    expect(await keep("page", fetch)).toBe("yesterday");
    expect(fetch).toHaveBeenCalledTimes(1);

    finish("today");
    await vi.waitFor(async () => expect(await keep("page", fetch)).toBe("today"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("waits for the source when the copy is older than it keeps them", async () => {
    const keep = keptCopies(nextFolder(), RULES);
    saveCopy("page", "last year", 24 * 365);
    expect(await keep("page", async () => "today")).toBe("today");
  });

  it("falls back on any copy when the source can't be reached", async () => {
    const keep = keptCopies(nextFolder(), RULES);
    saveCopy("page", "last year", 24 * 365);
    expect(await keep("page", async () => Promise.reject(new Error("EDHREC: HTTP 500")))).toBe("last year");
  });

  it("passes the source's error on when there's no copy", async () => {
    const keep = keptCopies(nextFolder(), RULES);
    await expect(keep("page", async () => Promise.reject(new Error("EDHREC: HTTP 500")))).rejects.toThrow("HTTP 500");
  });

  it("keeps an answer of nothing too, so an unknown page isn't asked about again", async () => {
    const keep = keptCopies(nextFolder(), RULES);
    const fetch = vi.fn(async () => null);
    expect(await keep("commanders/sol-ring", fetch)).toBeNull();
    await vi.waitFor(() => expect(files.has(fileOf("commanders/sol-ring"))).toBe(true));
    expect(await keep("commanders/sol-ring", fetch)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shares one fetch between lookups made at once", async () => {
    const keep = keptCopies(nextFolder(), RULES);
    const fetch = vi.fn(async () => "page");
    expect(await Promise.all([keep("page", fetch), keep("page", fetch), keep("other", fetch)])).toEqual(["page", "page", "page"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps nothing on a server that isn't your own computer", async () => {
    saving.on = false;
    const keep = keptCopies(nextFolder(), RULES);
    const fetch = vi.fn(async () => "page");
    await keep("page", fetch);
    await keep("page", fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect([...files.keys()].filter((f) => f.startsWith(`${folder}/`))).toEqual([]);
  });
});
