// Some stores publish their whole list rather than a page per card, so it's read
// in one go, kept, and looked up card by card. A list stays until it's due and
// is then read again in the background, so nobody waits on a slow or rate-limited
// store, and a copy on the computer means the app has prices from the moment it
// starts. If a read fails, the old list stands until the next try.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tcgphSlug } from "@/lib/slugs";
import type { TcgphPrint } from "@/lib/types";
import { reportSourceError } from "./http";
import { dataDir } from "@/lib/data-dir";

/** A store's list: the printings of each card it has, by the card's key. */
export type StoreCatalog = Record<string, TcgphPrint[]>;

/** How long a list stands before it's read again. */
const FRESH_MS = 6 * 60 * 60 * 1000;
/** How long to leave a store after a failed read. */
const RETRY_MS = 10 * 60 * 1000;

const DIR = dataDir("stores");

interface Saved {
  readAt: number;
  catalog: StoreCatalog;
}

interface Held {
  catalog?: StoreCatalog;
  /** When the list is next due to be read. */
  due: number;
  /** The computer's copy being looked up, once. */
  opened?: Promise<void>;
  reading?: Promise<void>;
}

// Each page and route is bundled on its own, so what they share has to live on
// the process, or each would read the whole list for itself.
const SHARED = Symbol.for("theorist.store-lists");
const shared = globalThis as unknown as Record<symbol, Map<string, Held> | undefined>;
const lists = (shared[SHARED] ??= new Map<string, Held>());

/** Double-faced cards go by their front face here: stores differ on whether they name the back too. */
export const storeKey = (name: string) => tcgphSlug(name.split(" // ")[0]);

async function readSaved(id: string): Promise<Saved | null> {
  try {
    return JSON.parse(await readFile(dataDir("stores", `${id}.json`), "utf8")) as Saved;
  } catch {
    return null;
  }
}

/** Fails quietly: a host with no disk to write to just reads the list again after a restart. */
async function writeSaved(id: string, saved: Saved) {
  try {
    await mkdir(DIR, { recursive: true });
    const file = dataDir("stores", `${id}.json`);
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(saved));
    await rename(temp, file);
  } catch {}
}

/**
 * A lookup into one store's list. It waits for the list only when there's none
 * yet, and for no longer than `patienceMs`; a list that takes longer turns up
 * in the lookups after it arrives.
 */
export function storeList(id: string, read: () => Promise<StoreCatalog>, patienceMs = 0) {
  const refresh = (held: Held) => {
    held.reading = read()
      .then(async (catalog) => {
        const readAt = Date.now();
        held.catalog = catalog;
        held.due = readAt + FRESH_MS;
        await writeSaved(id, { readAt, catalog });
      })
      .catch((error) => {
        reportSourceError(`${id} list`, error);
        held.due = Date.now() + RETRY_MS;
      })
      .finally(() => {
        held.reading = undefined;
      });
  };

  return async (name: string): Promise<TcgphPrint[]> => {
    const held = lists.get(id) ?? { due: 0 };
    lists.set(id, held);
    held.opened ??= readSaved(id).then((saved) => {
      if (!saved) return;
      held.catalog = saved.catalog;
      held.due = saved.readAt + FRESH_MS;
    });
    await held.opened;
    if (!held.reading && Date.now() >= held.due) refresh(held);
    if (!held.catalog && held.reading && patienceMs > 0) {
      await Promise.race([held.reading, new Promise((resolve) => setTimeout(resolve, patienceMs))]);
    }
    return held.catalog?.[storeKey(name)] ?? [];
  };
}
