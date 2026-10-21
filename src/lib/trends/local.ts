// This app's own price tracking: once a day it saves every card's market price
// from Scryfall's daily file (about 25 MB) into .data/price-history (see
// storage.ts), and compares it with earlier days to find surges. History
// starts the first day the app runs, so the first surges show from the second
// day; 90 days are kept for the price history explorer (history.ts).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { reportSourceError, SourceError, USER_AGENT } from "@/lib/sources/http";
import { getOracleCardsFile } from "@/lib/sources/scryfall";
import { addDays, dateOnOrBefore, surge, topSurges, WINDOWS } from "./compute.ts";
import { seriesFor } from "./history";
import {
  deleteSnapshot,
  DIR,
  compressOldSnapshots,
  mergeCardMeta,
  readCardMeta,
  readSnapshot,
  saveSnapshot,
  savedDates,
  writeJson,
  type CardMeta,
  type Prices,
} from "./storage";
import type { MarketTrends, TrendCard, TrendWindow, TrendWindowData } from "./types.ts";

const TRENDS_FILE = path.join(DIR, "trends.json");
/** Local tracking covers a day and a week; the shared file adds a month. */
const LOCAL_WINDOWS: TrendWindow[] = ["day", "week"];
/** Days of snapshots kept for the price history explorer (each is about 700 KB, so about 65 MB in all). */
export const KEEP_DAYS = 90;
/** Check Scryfall for a new daily file at most this often. */
const CHECK_EVERY_MS = 3 * 60 * 60_000;
/** The daily file is big; give a slow connection time to fetch it. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

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
      if (change !== null) cards.push({ ...card, id, fromUsd: then[id] / 100, toUsd: cents / 100, change });
    }
    windows[window] = { since, cards: topSurges(cards) } satisfies TrendWindowData;
  }
  return { source: "scryfall", pricesFrom: date, windows };
}

async function refresh() {
  const file = await getOracleCardsFile();
  const date = file.updatedAt.slice(0, 10);
  const dates = await savedDates();
  // Done for today, unless the card names are missing (history saved by an older version of the app).
  if (dates.includes(date) && (await readCardMeta()).size > 0) return;

  const downloaded = await downloadPrices(file.url);
  await saveSnapshot(date, downloaded.prices);
  const meta = await mergeCardMeta(downloaded.meta);
  if (!dates.includes(date)) dates.push(date);

  // Old days beyond the kept history go; the trend windows need at most a week and a bit.
  const kept: string[] = [];
  for (const d of dates.filter((d) => d !== date)) {
    if (d < addDays(date, -KEEP_DAYS)) await deleteSnapshot(d);
    else kept.push(d);
  }
  await compressOldSnapshots(kept);
  const earlier: Record<string, Prices> = {};
  for (const d of kept.filter((d) => d >= addDays(date, -12))) {
    const prices = await readSnapshot(d);
    if (prices) earlier[d] = prices;
  }
  const trends = compareSnapshots(date, downloaded.prices, meta, earlier);

  // Each shown card's price over the kept days, for its little chart.
  const shown = new Set(Object.values(trends.windows).flatMap((w) => w!.cards.map((c) => c.id!)));
  const series = await seriesFor(shown, [...kept, date]);
  for (const window of Object.values(trends.windows)) {
    for (const card of window!.cards) card.history = series.get(card.id!);
  }
  await writeJson(TRENDS_FILE, trends);
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
  /** How many days of prices are saved. */
  days: number;
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
  return { trackingSince: dates[0], days: dates.length, trends };
}
