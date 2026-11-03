import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import handler from "./remote.js";

const { createRemoteHandler } = handler as unknown as { createRemoteHandler: (options?: { dir?: string; memoryBytes?: number; diskBytes?: number }) => Handler };

interface Entry {
  value: ReadableStream<Uint8Array>;
  tags: string[];
  stale: number;
  timestamp: number;
  expire: number;
  revalidate: number;
}
interface Handler {
  get(key: string, softTags?: string[]): Promise<Entry | undefined>;
  set(key: string, pending: Promise<Entry>): Promise<void>;
  updateTags(tags: string[], durations?: { expire?: number }): Promise<void>;
}

const streamOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
const entry = (text: string, overrides: Partial<Entry> = {}): Entry => ({
  value: streamOf(text),
  tags: [],
  stale: 300,
  timestamp: Date.now(),
  expire: 7 * 24 * 60 * 60,
  revalidate: 24 * 60 * 60,
  ...overrides,
});
const textOf = async (found: Entry | undefined) => (found ? new Response(found.value).text() : undefined);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "theorist-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the remote cache handler", () => {
  it("answers from memory, with a fresh stream each time", async () => {
    const cache = createRemoteHandler();
    await cache.set("k", Promise.resolve(entry("Sol Ring")));
    expect(await textOf(await cache.get("k"))).toBe("Sol Ring");
    expect(await textOf(await cache.get("k"))).toBe("Sol Ring");
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("answers after a restart from what it kept on disk", async () => {
    await createRemoteHandler({ dir }).set("k", Promise.resolve(entry("Atraxa\nline two", { tags: ["t"] })));
    const restarted = createRemoteHandler({ dir });
    const found = await restarted.get("k");
    expect(await textOf(found)).toBe("Atraxa\nline two");
    expect(found).toMatchObject({ tags: ["t"], revalidate: 24 * 60 * 60 });
  });

  it("serves an entry past its revalidate time (Next refreshes it) but not past its expiry", async () => {
    const day = 24 * 60 * 60 * 1000;
    const cache = createRemoteHandler({ dir });
    await cache.set("old", Promise.resolve(entry("three days", { timestamp: Date.now() - 3 * day })));
    await cache.set("gone", Promise.resolve(entry("two weeks", { timestamp: Date.now() - 14 * day })));
    const restarted = createRemoteHandler({ dir });
    expect(await textOf(await restarted.get("old"))).toBe("three days");
    expect(await restarted.get("gone")).toBeUndefined();
    // The expired one is deleted from disk.
    expect((await readdir(dir)).length).toBe(1);
  });

  it("doesn't keep entries that expire at once", async () => {
    const cache = createRemoteHandler({ dir });
    await cache.set("k", Promise.resolve(entry("dynamic", { expire: 0 })));
    expect(await cache.get("k")).toBeUndefined();
    expect(await readdir(dir).catch(() => [])).toEqual([]);
  });

  it("keeps a never-expiring entry, which JSON can't spell", async () => {
    await createRemoteHandler({ dir }).set("k", Promise.resolve(entry("forever", { expire: Infinity })));
    expect(await textOf(await createRemoteHandler({ dir }).get("k"))).toBe("forever");
  });

  it("treats a damaged file as missing", async () => {
    await createRemoteHandler({ dir }).set("k", Promise.resolve(entry("fine")));
    const [file] = await readdir(dir);
    await writeFile(path.join(dir, file), "not an entry");
    expect(await createRemoteHandler({ dir }).get("k")).toBeUndefined();
  });

  it("waits for an entry still being made", async () => {
    const cache = createRemoteHandler();
    let finish!: (e: Entry) => void;
    const setting = cache.set("k", new Promise<Entry>((resolve) => (finish = resolve)));
    const reading = cache.get("k");
    finish(entry("made"));
    await setting;
    expect(await textOf(await reading)).toBe("made");
  });

  it("drops the least recently used entries beyond its memory", async () => {
    const cache = createRemoteHandler({ memoryBytes: 30 });
    await cache.set("a", Promise.resolve(entry("0123456789")));
    await cache.set("b", Promise.resolve(entry("0123456789")));
    await cache.get("a");
    await cache.set("c", Promise.resolve(entry("0123456789")));
    expect(await cache.get("b")).toBeUndefined();
    expect(await textOf(await cache.get("a"))).toBe("0123456789");
  });

  it("stops serving an entry whose tag was expired", async () => {
    const cache = createRemoteHandler();
    await cache.set("k", Promise.resolve(entry("tagged", { tags: ["prices"], timestamp: Date.now() - 1000 })));
    await cache.updateTags(["prices"]);
    expect(await cache.get("k")).toBeUndefined();
  });
});
