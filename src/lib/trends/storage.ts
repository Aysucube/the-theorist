// Where this app keeps its own daily price history: one gzipped snapshot per
// day in .data/price-history (every card's price, about 700 KB each), plus a
// table of card names and images that grows as new printings show up.
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

export const DIR = path.join(process.cwd(), ".data", "price-history");
const CARDS_FILE = path.join(DIR, "cards.json.gz");

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** Prices in cents, keyed by Scryfall printing id: the same printing is compared day to day. */
export type Prices = Record<string, number>;

export interface CardMeta {
  name: string;
  imageUrl?: string;
  setCode: string;
}

/** Stored as [name, imageUrl, setCode] to keep the file small. */
type StoredMeta = [string, string | null, string];

const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.json(\.gz)?$/;

/** Every day with a saved snapshot, oldest first. */
export async function savedDates(): Promise<string[]> {
  try {
    const dates = (await readdir(DIR)).map((f) => f.match(DATE_FILE)?.[1]).filter((d): d is string => Boolean(d));
    return [...new Set(dates)].sort();
  } catch {
    return [];
  }
}

async function writeAtomically(file: string, data: string | Buffer) {
  // Write then rename, so a crash never leaves half a file behind.
  const temp = `${file}.tmp`;
  await writeFile(temp, data);
  await rename(temp, file);
}

export async function writeJson(file: string, value: unknown) {
  await writeAtomically(file, JSON.stringify(value));
}

export async function saveSnapshot(date: string, prices: Prices) {
  await mkdir(DIR, { recursive: true });
  await writeAtomically(path.join(DIR, `${date}.json.gz`), await gzipAsync(JSON.stringify(prices)));
}

/** A day's prices, or null if there's no snapshot (older versions saved them uncompressed). */
export async function readSnapshot(date: string): Promise<Prices | null> {
  try {
    return JSON.parse((await gunzipAsync(await readFile(path.join(DIR, `${date}.json.gz`)))).toString("utf8")) as Prices;
  } catch {
    try {
      return JSON.parse(await readFile(path.join(DIR, `${date}.json`), "utf8")) as Prices;
    } catch {
      return null;
    }
  }
}

/** Compresses snapshots older versions of the app saved as plain JSON (about half the space). */
export async function compressOldSnapshots(dates: string[]) {
  for (const date of dates) {
    const plain = path.join(DIR, `${date}.json`);
    try {
      const prices = JSON.parse(await readFile(plain, "utf8")) as Prices;
      await saveSnapshot(date, prices);
      await rm(plain, { force: true });
    } catch {
      // Already compressed (or gone).
    }
  }
}

export async function deleteSnapshot(date: string) {
  await rm(path.join(DIR, `${date}.json.gz`), { force: true });
  await rm(path.join(DIR, `${date}.json`), { force: true });
}

/** Names and images of Commander-legal printings seen so far. */
export async function readCardMeta(): Promise<Map<string, CardMeta>> {
  try {
    const stored = JSON.parse((await gunzipAsync(await readFile(CARDS_FILE))).toString("utf8")) as Record<string, StoredMeta>;
    return new Map(Object.entries(stored).map(([id, [name, imageUrl, setCode]]) => [id, { name, imageUrl: imageUrl ?? undefined, setCode }]));
  } catch {
    return new Map();
  }
}

/** Adds today's printings to the saved table (printings seen earlier stay, so older days keep their names). */
export async function mergeCardMeta(today: Map<string, CardMeta>) {
  const all = await readCardMeta();
  for (const [id, meta] of today) all.set(id, meta);
  const stored: Record<string, StoredMeta> = {};
  for (const [id, m] of all) stored[id] = [m.name, m.imageUrl ?? null, m.setCode];
  await mkdir(DIR, { recursive: true });
  await writeAtomically(CARDS_FILE, await gzipAsync(JSON.stringify(stored)));
  return all;
}
