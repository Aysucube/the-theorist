// This app's own price tracking: once a day it saves every card's market price
// from Scryfall's daily file (about 25 MB) into .data/price-history, and
// compares it with earlier days to find surges. History starts the first day
// the app runs, so the first surges show from the second day.
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { reportSourceError, SourceError, USER_AGENT } from "@/lib/sources/http";
import { getOracleCardsFile } from "@/lib/sources/scryfall";
import { addDays, dateOnOrBefore, surge, topSurges, WINDOWS } from "./compute.ts";
import type { MarketTrends, TrendCard, TrendWindow, TrendWindowData } from "./types.ts";

const DIR = path.join(process.cwd(), ".data", "price-history");
const TRENDS_FILE = path.join(DIR, "trends.json");
/** Local tracking covers a day and a week; the shared file adds a month. */
const LOCAL_WINDOWS: TrendWindow[] = ["day", "week"];
/** Days of snapshots kept: a week plus slack (each is about 1.5 MB). */
const KEEP_DAYS = 12;
/** Check Scryfall for a new daily file at most this often. */
const CHECK_EVERY_MS = 3 * 60 * 60_000;
/** The daily file is big; give a slow connection time to fetch it. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/** Prices in cents, keyed by Scryfall printing id: the same printing is compared day to day. */
type Prices = Record<string, number>;
interface CardMeta {
  name: string;
  imageUrl?: string;
  setCode: string;
}

const snapshotFile = (date: string) => path.join(DIR, `${date}.json`);

async function savedDates(): Promise<string[]> {
  try {
    return (await readdir(DIR))
      .map((f) => f.match(/^(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
      .filter((d): d is string => Boolean(d))
      .sort();
  } catch {
    return [];
  }
}

async function writeJson(file: string, value: unknown) {
  // Write then rename, so a crash never leaves half a file behind.
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, file);
}

interface RawCard {
  id: string;
  name: string;
  set: string;
  digital?: boolean;
  prices?: { usd?: string | null };
  legalities?: { commander?: string };
  image_uris?: { normal?: string };
  card_faces?: { image_uris?: { normal?: string } }[];
}

/** Streams Scryfall's daily file: every paper card's nonfoil price, and names and images for Commander-legal ones. */
async function downloadPrices(url: string): Promise<{ prices: Prices; meta: Map<string, CardMeta> }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch {
    throw new SourceError("Scryfall", "couldn't download the daily card file");
  }
  if (!res.ok || !res.body) throw new SourceError("Scryfall", `daily card file: HTTP ${res.status}`);

  const lines = createInterface({
    input: Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  const prices: Prices = {};
  const meta = new Map<string, CardMeta>();
  for await (const line of lines) {
    const text = line.trim().replace(/,$/, "");
    if (!text.startsWith("{")) continue;
    const card = JSON.parse(text) as RawCard;
    const usd = Number(card.prices?.usd);
    if (card.digital || !usd) continue;
    prices[card.id] = Math.round(usd * 100);
    if (card.legalities?.commander === "legal") {
      meta.set(card.id, {
        name: card.name,
        imageUrl: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal,
        setCode: card.set.toUpperCase(),
      });
    }
  }
  return { prices, meta };
}

/** Today's surges against the closest earlier snapshot for each window. */
export function compareSnapshots(
  date: string,
  today: Prices,
  meta: Map<string, CardMeta>,
  earlier: Record<string, Prices>,
): MarketTrends {
  const dates = Object.keys(earlier).filter((d) => d < date);
  const windows: MarketTrends["windows"] = {};
  for (const window of LOCAL_WINDOWS) {
    const { days, slackDays } = WINDOWS[window];
    const target = addDays(date, -days);
    const since = dateOnOrBefore(dates, target, addDays(target, -slackDays));
    if (!since) continue;
    const then = earlier[since];
    const cards: TrendCard[] = [];
    for (const [id, cents] of Object.entries(today)) {
      const card = meta.get(id);
      if (!card || then[id] === undefined) continue;
      const change = surge(then[id] / 100, cents / 100);
      if (change !== null) cards.push({ ...card, fromUsd: then[id] / 100, toUsd: cents / 100, change });
    }
    windows[window] = { since, cards: topSurges(cards) } satisfies TrendWindowData;
  }
  return { source: "scryfall", pricesFrom: date, windows };
}

async function refresh() {
  const file = await getOracleCardsFile();
  const date = file.updatedAt.slice(0, 10);
  const dates = await savedDates();
  if (dates.includes(date)) return;

  const { prices, meta } = await downloadPrices(file.url);
  await mkdir(DIR, { recursive: true });
  await writeJson(snapshotFile(date), prices);

  const earlier: Record<string, Prices> = {};
  for (const d of dates) {
    if (d >= addDays(date, -KEEP_DAYS)) earlier[d] = JSON.parse(await readFile(snapshotFile(d), "utf8")) as Prices;
    else await rm(snapshotFile(d), { force: true });
  }
  await writeJson(TRENDS_FILE, compareSnapshots(date, prices, meta, earlier));
}

// One refresh at a time, and not more often than CHECK_EVERY_MS.
let running: Promise<void> | null = null;
let lastCheck = 0;

/** Saves today's prices if Scryfall has a new daily file. Safe to call on every request. */
export function refreshLocalTrends(): Promise<void> {
  if (running) return running;
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return Promise.resolve();
  lastCheck = Date.now();
  running = refresh()
    .catch((error) => {
      reportSourceError("price tracking", error);
      // Try again in 15 minutes rather than 3 hours.
      lastCheck = Date.now() - CHECK_EVERY_MS + 15 * 60_000;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export interface LocalStatus {
  /** The first day this app saved prices, if any. */
  trackingSince?: string;
  trends: MarketTrends | null;
}

/** What local tracking has so far. */
export async function readLocalTrends(): Promise<LocalStatus> {
  const dates = await savedDates();
  let trends: MarketTrends | null = null;
  try {
    trends = JSON.parse(await readFile(TRENDS_FILE, "utf8")) as MarketTrends;
  } catch {
    // Nothing tracked yet.
  }
  return { trackingSince: dates[0], trends };
}
