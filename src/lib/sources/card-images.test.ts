import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCardImage } from "./card-images";

const files = vi.hoisted(() => new Map<string, Uint8Array>());
const name = (file: string) => file.replace(/\\/g, "/").split("/").pop()!;
vi.mock("node:fs/promises", () => ({
  mkdir: async () => {},
  readFile: async (file: string) => {
    const saved = files.get(name(file));
    if (!saved) throw new Error("no file");
    return saved;
  },
  writeFile: async (file: string, bytes: Uint8Array) => void files.set(name(file), bytes),
  rename: async (from: string, to: string) => {
    files.set(name(to), files.get(name(from))!);
    files.delete(name(from));
  },
}));

const IMAGE = "normal/front/b/7/b769ba9e-2ac8-48a9-9f45-23a4ccd0cb96.jpg";
const bytes = new Uint8Array([1, 2, 3]);
const answer = () => new Response(bytes);
/** A connection that hangs until it's called off, as a dead one does. */
const hang = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));

describe("getCardImage", () => {
  beforeEach(() => {
    files.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks Scryfall for the image at its version", async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => answer());
    vi.stubGlobal("fetch", fetch);
    expect(await getCardImage(IMAGE, "?1630616412")).toEqual(bytes);
    expect(fetch.mock.calls[0][0]).toBe(`https://cards.scryfall.io/${IMAGE}?1630616412`);
  });

  it("ignores a retry marker, so a browser's second try finds the same image", async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => answer());
    vi.stubGlobal("fetch", fetch);
    await getCardImage(IMAGE, "?1630616412");
    await getCardImage(IMAGE, "?1630616412&retry=1");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps what it fetches, and doesn't ask Scryfall twice", async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => answer());
    vi.stubGlobal("fetch", fetch);
    await getCardImage(IMAGE, "?1");
    expect(await getCardImage(IMAGE, "?1")).toEqual(bytes);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches a new version of an image", async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => answer());
    vi.stubGlobal("fetch", fetch);
    await getCardImage(IMAGE, "?1");
    await getCardImage(IMAGE, "?2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't wait on a dead connection: it tries again alongside it", async () => {
    const fetch = vi.fn<typeof hang>().mockImplementationOnce(hang).mockImplementation(async () => answer());
    vi.stubGlobal("fetch", fetch);

    const image = getCardImage(IMAGE, "?1");
    await vi.advanceTimersByTimeAsync(1_499);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await image).toEqual(bytes);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("calls off the other tries once one answers", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        signals.push(init!.signal!);
        return signals.length === 2 ? answer() : hang(_url, init);
      }),
    );
    const image = getCardImage(IMAGE, "?1");
    await vi.advanceTimersByTimeAsync(1_500);
    await image;
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signals).toHaveLength(2);
  });

  it("fails if nothing answers in time, keeping nothing", async () => {
    const clock = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(clock.signal);
    vi.stubGlobal("fetch", vi.fn(hang));

    const image = getCardImage(IMAGE, "?1").catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(6_000);
    clock.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(await image).toBe("Scryfall images: no answer");
    expect(files.size).toBe(0);
    timeout.mockRestore();
  });

  it("fails if Scryfall refuses every try", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    const image = getCardImage(IMAGE, "?1").catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(6_000);

    expect(await image).toBe("Scryfall images: no answer");
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it.each(["../../secrets.txt", "normal/front/b/7/../../../etc.jpg", "evil.example/x.jpg", "normal/front/z/7/abc.jpg", "normal/side/b/7/abc.jpg", "normal/front/b/7/abc.exe"])("refuses %s, which is no image address", async (path) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await getCardImage(path, "")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
