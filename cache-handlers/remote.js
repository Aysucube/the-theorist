// Where Next.js keeps what "use cache: remote" functions return (card lookups,
// printings, prices, EDHREC's numbers...). Next's own handler holds them in
// memory only, so every restart asked every source again. This one also keeps
// them on the computer (<data folder>/next-cache) when The Theorist runs there
// (the desktop app and the launchers), so a restarted app answers from disk.
// An entry is served until it expires, and Next refreshes it in the background
// once it's past its revalidate time. Elsewhere (a shared server, `next dev`)
// it's memory only, like Next's own.
//
// Plain CommonJS: Next.js loads this file by path at run time.
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

/** Memory kept for entries, like Next's default (50 MB), least recently used first out. */
const MEMORY_BYTES = 50 * 1024 * 1024;
/** Disk kept for entries; the oldest go first beyond this. */
const DISK_BYTES = 512 * 1024 * 1024;

const now = () => Date.now();
/** JSON has no Infinity; "never" is kept as a very long time. */
const finite = (seconds) => (Number.isFinite(seconds) ? seconds : 0xfffffffe);

function streamOf(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function bytesOf(stream) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {{ dir?: string, memoryBytes?: number, diskBytes?: number }} options
 *   dir: where to keep entries on disk; none keeps them in memory only.
 */
function createRemoteHandler({ dir, memoryBytes = MEMORY_BYTES, diskBytes = DISK_BYTES } = {}) {
  /** key → { meta, value, size }, oldest first (a Map keeps insertion order). */
  const memory = new Map();
  let memoryUsed = 0;
  const pendingSets = new Map();
  /** tag → { stale?, expired? } in ms, for revalidateTag (unused by the app today, kept to the contract). */
  const tags = new Map();
  let tidied;

  const fileOf = (key) => path.join(dir, `${createHash("sha256").update(key).digest("hex")}.entry`);

  function remember(key, meta, value) {
    const old = memory.get(key);
    if (old) {
      memory.delete(key);
      memoryUsed -= old.size;
    }
    const size = value.byteLength + key.length;
    if (size > memoryBytes) return;
    memory.set(key, { meta, value, size });
    memoryUsed += size;
    for (const [oldest, entry] of memory) {
      if (memoryUsed <= memoryBytes) break;
      memory.delete(oldest);
      memoryUsed -= entry.size;
    }
  }

  const isExpired = (meta) => meta.expire < 0 || now() > meta.timestamp + meta.expire * 1000;

  function tagState(meta) {
    let revalidate = meta.revalidate;
    for (const tag of meta.tags) {
      const { stale = 0, expired = 0 } = tags.get(tag) ?? {};
      if (expired > meta.timestamp && expired <= now()) return null;
      if (stale > meta.timestamp) revalidate = -1;
    }
    return revalidate;
  }

  /** An entry on disk: one JSON line of its details, then its bytes. */
  async function readDisk(key) {
    const buffer = await fs.readFile(fileOf(key));
    const newline = buffer.indexOf(10);
    if (newline < 0) return null;
    const meta = JSON.parse(buffer.subarray(0, newline).toString("utf8"));
    if (meta.key !== key) return null;
    return { meta: meta.entry, value: new Uint8Array(buffer.subarray(newline + 1)) };
  }

  async function writeDisk(key, meta, value) {
    await fs.mkdir(dir, { recursive: true });
    const target = fileOf(key);
    const temp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, Buffer.concat([Buffer.from(`${JSON.stringify({ key, entry: meta })}\n`), value]));
    await fs.rename(temp, target);
  }

  /** Once per run: drops expired entries and the oldest beyond the disk allowance. */
  async function tidy() {
    try {
      const files = [];
      for (const name of await fs.readdir(dir)) {
        const full = path.join(dir, name);
        const info = await fs.stat(full);
        if (name.endsWith(".tmp") || info.mtimeMs < now() - 31 * 24 * 60 * 60 * 1000) {
          await fs.rm(full, { force: true });
          continue;
        }
        files.push({ full, size: info.size, at: info.mtimeMs });
      }
      let used = files.reduce((sum, f) => sum + f.size, 0);
      for (const file of files.sort((a, b) => a.at - b.at)) {
        if (used <= diskBytes) break;
        await fs.rm(file.full, { force: true });
        used -= file.size;
      }
    } catch {
      // Nothing kept yet.
    }
  }

  return {
    async get(key) {
      try {
        const pending = pendingSets.get(key);
        if (pending) await pending;
        let held = memory.get(key);
        if (held) {
          // Most recently used goes to the back.
          memory.delete(key);
          memory.set(key, held);
        } else if (dir) {
          tidied ??= tidy();
          const kept = await readDisk(key).catch(() => null);
          if (!kept) return undefined;
          remember(key, kept.meta, kept.value);
          held = { meta: kept.meta, value: kept.value };
        } else {
          return undefined;
        }
        if (isExpired(held.meta)) {
          memory.delete(key);
          if (dir) await fs.rm(fileOf(key), { force: true }).catch(() => {});
          return undefined;
        }
        const revalidate = tagState(held.meta);
        if (revalidate === null) return undefined;
        return { ...held.meta, revalidate, value: streamOf(held.value) };
      } catch {
        return undefined;
      }
    },

    async set(key, pendingEntry) {
      let done = () => {};
      pendingSets.set(key, new Promise((resolve) => (done = resolve)));
      try {
        const entry = await pendingEntry;
        // An entry that expires at once is regenerated on every read; keeping it is wasted work.
        if (entry.expire === 0) return;
        const value = await bytesOf(entry.value);
        const meta = { tags: entry.tags, stale: finite(entry.stale), timestamp: entry.timestamp, expire: finite(entry.expire), revalidate: finite(entry.revalidate) };
        remember(key, meta, value);
        if (dir) {
          tidied ??= tidy();
          await writeDisk(key, meta, value);
        }
      } catch {
        // A lost entry is just made again next time.
      } finally {
        done();
        pendingSets.delete(key);
      }
    },

    async refreshTags() {
      // One process: nothing to sync.
    },

    async getExpiration(names) {
      return Math.max(0, ...names.map((tag) => tags.get(tag)?.expired ?? 0));
    },

    async updateTags(names, durations) {
      const at = now();
      for (const tag of names) {
        const state = { ...tags.get(tag) };
        if (durations) {
          state.stale = at;
          if (durations.expire !== undefined) state.expired = at + durations.expire * 1000;
        } else {
          state.expired = at;
        }
        tags.set(tag, state);
      }
    },
  };
}

// Read through a variable: the build's file tracing copies in the whole project for a plain process.cwd() call.
const workingFolder = process.cwd;

function dataFolder() {
  return process.env.THEORIST_DATA_DIR || path.join(workingFolder(), ".data");
}

// On disk only for The Theorist run on your own computer, and only for a built app: `next dev` makes new keys on every start.
const onComputer = process.env.THEORIST_SAVE_ON_COMPUTER === "1" && process.env.NODE_ENV === "production";

module.exports = createRemoteHandler({ dir: onComputer ? path.join(dataFolder(), "next-cache") : undefined });
module.exports.createRemoteHandler = createRemoteHandler;
