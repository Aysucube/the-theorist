// Every Commander-legal card's details (type, cost, colors, text, image) from
// Scryfall's daily file, kept on the computer (.data/cards) and in memory.
// EDHREC's lists name hundreds of cards each, and Scryfall's API answers 75 at
// a time at two requests a second, so one commander's cards took ten seconds or
// more; from here they take no time. The daily file is read with the day's
// prices (see trends/local.ts); a card it doesn't have yet (one out today) still
// goes to the API. Kept only when The Theorist runs on your own computer (see
// savingOnComputer).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { savingOnComputer } from "@/lib/saved-data";
import type { CardDetails } from "@/lib/types";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const FILE = path.join(process.cwd(), ".data", "cards", "details.json.gz");
/**
 * While the first index is being read, lookups wait this long for it rather
 * than race its download for the connection (the daily file is 25 MB).
 */
const ARRIVAL_PATIENCE_MS = 45_000;

interface Saved {
  /** The day of Scryfall's file, e.g. "2026-11-03". */
  date: string;
  cards: CardDetails[];
}

interface Held {
  date?: string;
  byName?: Map<string, CardDetails>;
  /** The saved file being read, once. */
  opened?: Promise<void>;
  /** The first index, while the daily file is being read for it, and what says it's here. */
  arriving?: Promise<void>;
  arrived?: () => void;
}

// Each route is bundled on its own, so the index lives on the process, read once for all of them.
const SHARED = Symbol.for("theorist.card-index");
const shared = globalThis as unknown as Record<symbol, Held | undefined>;
const held = (shared[SHARED] ??= {});

const nameKey = (name: string) => name.trim().toLowerCase();

function byNameOf(cards: CardDetails[]): Map<string, CardDetails> {
  const byName = new Map(cards.map((card) => [nameKey(card.name), card]));
  // Two-sided and split cards also go by their first half, as Scryfall finds them, unless a card has that name.
  for (const card of cards) {
    const front = nameKey(card.name.split(" // ")[0]);
    if (!byName.has(front)) byName.set(front, card);
  }
  return byName;
}

async function open() {
  if (!savingOnComputer()) return;
  held.opened ??= readFile(FILE)
    .then((zipped) => gunzipAsync(zipped))
    .then((json) => {
      const saved = JSON.parse(json.toString("utf8")) as Saved;
      if (held.byName || !Array.isArray(saved.cards)) return;
      held.date = saved.date;
      held.byName = byNameOf(saved.cards);
    })
    .catch(() => {
      // Not saved yet: the next daily file makes it.
    });
  await held.opened;
}

/** Reads the saved details into memory now, so the first lookup doesn't wait for them. Says whether there were any. */
export async function openCardIndex(): Promise<boolean> {
  await open();
  return held.byName !== undefined;
}

/** Whether this day's file still has to be read for the index (never where nothing is kept on the computer). */
export async function cardIndexNeeds(date: string): Promise<boolean> {
  if (!savingOnComputer()) return false;
  await open();
  return held.date !== date;
}

/** The details the index has for these names, keyed by the name as asked, and the names it doesn't have. */
export async function indexedDetails(names: string[]): Promise<{ found: Record<string, CardDetails>; missing: string[] }> {
  if (!savingOnComputer()) return { found: {}, missing: [...names] };
  await open();
  if (!held.byName && held.arriving) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([held.arriving, new Promise((resolve) => (timer = setTimeout(resolve, ARRIVAL_PATIENCE_MS)))]);
    clearTimeout(timer);
  }
  const found: Record<string, CardDetails> = {};
  const missing: string[] = [];
  for (const name of names) {
    const card = held.byName?.get(nameKey(name)) ?? (name.includes(" // ") ? held.byName?.get(nameKey(name.split(" // ")[0])) : undefined);
    if (card) found[name] = card;
    else missing.push(name);
  }
  return { found, missing };
}

/**
 * While there's no index yet, lookups wait (a while) for the one `reading` is
 * making rather than race it for the connection; they stop waiting when it's
 * saved, or when `reading` ends without one.
 */
export function awaitCardIndex(reading: Promise<unknown>): void {
  if (!savingOnComputer() || held.byName || held.arriving) return;
  held.arriving = new Promise((resolve) => (held.arrived = resolve));
  const ended = () => held.arrived?.();
  void reading.then(ended, ended);
  void held.arriving.then(() => {
    held.arriving = undefined;
    held.arrived = undefined;
  });
}

/** Starts using a day's details and saves them for the next start. */
export async function saveCardIndex(date: string, cards: CardDetails[]): Promise<void> {
  if (!savingOnComputer()) return;
  held.date = date;
  held.byName = byNameOf(cards);
  held.opened = Promise.resolve();
  held.arrived?.();
  await mkdir(path.dirname(FILE), { recursive: true });
  const temp = `${FILE}.${process.pid}.tmp`;
  await writeFile(temp, await gzipAsync(JSON.stringify({ date, cards } satisfies Saved)));
  await rename(temp, FILE);
}
