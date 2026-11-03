// A copy of what a source answered, kept on the computer (.data/<folder>) so the
// app doesn't ask again after a restart or a rebuild, which both empty Next.js's
// own cache. A copy is used as it is while it's fresh; after that it's still used
// at once while a new one is fetched in the background, and when the source can't
// be reached, an old copy beats an error. Two requests for the same thing at once
// share one fetch. Copies are kept only when The Theorist runs on your own
// computer (see savingOnComputer); elsewhere every lookup goes to the source.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { savingOnComputer } from "@/lib/saved-data";
import { reportSourceError } from "./http";
import { dataDir } from "@/lib/data-dir";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface KeepRules {
  /** Used as it is for this long. */
  freshMs: number;
  /** Used while a new one is fetched for up to this long; older copies are deleted. */
  keepMs: number;
}

interface Kept<T> {
  savedAt: number;
  value: T;
}

// Each route is bundled on its own, so what they share has to live on the process.
const SHARED = Symbol.for("theorist.kept-copies");
const shared = globalThis as unknown as Record<symbol, { fetching: Map<string, Promise<unknown>>; tidied: Set<string> } | undefined>;
const state = (shared[SHARED] ??= { fetching: new Map(), tidied: new Set() });

export function keptCopies(folder: string, rules: KeepRules) {
  const dir = dataDir(folder);
  // Ignored by the build's file tracing, which can't tell where these lead and would copy in the files beside this one.
  const file = (key: string) => path.join(/*turbopackIgnore: true*/ dir, `${encodeURIComponent(key)}.json.gz`);

  async function read<T>(key: string): Promise<Kept<T> | null> {
    try {
      const kept = JSON.parse((await gunzipAsync(await readFile(file(key)))).toString("utf8")) as Kept<T>;
      return typeof kept?.savedAt === "number" ? kept : null;
    } catch {
      return null;
    }
  }

  /** Fails quietly: without a copy the next lookup just asks the source again. */
  async function write(key: string, value: unknown) {
    try {
      await mkdir(dir, { recursive: true });
      const target = file(key);
      const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await writeFile(temp, await gzipAsync(JSON.stringify({ savedAt: Date.now(), value } satisfies Kept<unknown>)));
      await rename(temp, target);
    } catch {}
  }

  /** Deletes copies nobody has needed for longer than they're kept, once per run. */
  async function tidy() {
    if (state.tidied.has(folder)) return;
    state.tidied.add(folder);
    try {
      for (const name of await readdir(/*turbopackIgnore: true*/ dir)) {
        const full = path.join(/*turbopackIgnore: true*/ dir, name);
        if (Date.now() - (await stat(full)).mtimeMs > rules.keepMs) await rm(full, { force: true });
      }
    } catch {}
  }

  function fetchOnce<T>(key: string, fetch: () => Promise<T>, keep: boolean): Promise<T> {
    const id = `${folder}/${key}`;
    const running = state.fetching.get(id) as Promise<T> | undefined;
    if (running) return running;
    const next = fetch();
    state.fetching.set(id, next);
    // Whoever asked has the answer at once; it counts as being fetched until the copy is written, so nobody fetches it again meanwhile.
    next
      .then((value) => (keep ? write(key, value) : undefined))
      .catch(() => {})
      .finally(() => state.fetching.delete(id));
    return next;
  }

  /** `key` names what's fetched, e.g. a page's path; `fetch` asks the source and returns something JSON can hold. */
  return async function kept<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    if (!savingOnComputer()) return fetchOnce(key, fetch, false);
    void tidy();

    const copy = await read<T>(key);
    const age = copy ? Date.now() - copy.savedAt : Infinity;
    if (copy && age < rules.freshMs) return copy.value;
    if (copy && age < rules.keepMs) {
      fetchOnce(key, fetch, true).catch((error) => reportSourceError(`${folder} refresh`, error));
      return copy.value;
    }
    try {
      return await fetchOnce(key, fetch, true);
    } catch (error) {
      if (copy) return copy.value;
      throw error;
    }
  };
}
