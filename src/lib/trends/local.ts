// This app's own price tracking: once a day it saves every card's market price
// from Scryfall's daily file (about 25 MB) into .data/price-history (see
// storage.ts), and compares it with earlier days to find surges. History
// starts the first day the app runs, so the first surges show from the second
// day; 90 days are kept for the price history explorer (history.ts). The same
// read saves every card's details for EDHREC's lists (card-index.ts).
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { dataDir } from "@/lib/data-dir";
import { savingOnComputer } from "@/lib/saved-data";
import { awaitCardIndex, cardIndexNeeds, openCardIndex, saveCardIndex } from "@/lib/sources/card-index";
import { reportSourceError, SourceError, USER_AGENT } from "@/lib/sources/http";
import { getOracleCardsFile, toCardDetails, type RawCard as ScryfallCard } from "@/lib/sources/scryfall";
import type { CardDetails } from "@/lib/types";
import { addDays, dateOnOrBefore, surge, topSurges, WINDOWS } from "./compute.ts";
import { seriesFor } from "./history";
import {
  deleteSnapshot,
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

const TRENDS_FILE = dataDir("price-history", "trends.json");
/** Local tracking covers a day and a week; the shared file adds a month. */
const LOCAL_WINDOWS: TrendWindow[] = ["day", "week"];
/** Days of snapshots kept for the price history explorer (each is about 700 KB, so about 65 MB in all). */
export const KEEP_DAYS = 90;
/** Check Scryfall for a new daily file at most this often. */
const CHECK_EVERY_MS = 3 * 60 * 60_000;
/** The daily file is big; give a slow connection time to fetch it. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

interface RawCard extends ScryfallCard {
  set: string;
  digital?: boolean;
  /** "2026-11-13" */
  released_at?: string;
}

/** Game pieces that come with a set but aren't cards to put in a deck. */
const NOT_CARDS = new Set(["token", "double_faced_token", "emblem", "art_series"]);

/**
 * Streams Scryfall's daily file (made on `date`): every paper card's nonfoil
 * price, names and images for Commander-legal ones, and the full details of
 * every Commander-legal card and of cards not out yet (EDHREC lists them as
 * New Cards before they're legal).
 */
async function downloadDailyFile(url: string, date: string): Promise<{ prices: Prices; meta: Map<string, CardMeta>; cards: CardDetails[] }> {
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
  const cards: CardDetails[] = [];
  for await (const line of lines) {
    const text = line.trim().replace(/,$/, "");
    if (!text.startsWith("{")) continue;
    const card = JSON.parse(text) as RawCard;
    const legal = card.legalities?.commander === "legal";
    const upcoming = (card.released_at ?? "") > date && !NOT_CARDS.has(card.layout);
    // Details hold for every printing, even when the one the file picked is online-only (Lotus Petal, Savannah).
    if (legal || upcoming) cards.push(toCardDetails(card));
    const usd = Number(card.prices?.usd);
    if (card.digital || !usd) continue;
    prices[card.id] = Math.round(usd * 100);
    if (legal) {
      meta.set(card.id, {
        name: card.name,
        imageUrl: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal,
        setCode: card.set.toUpperCase(),
      });
    }
  }
  return { prices, meta, cards };
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
  // Done for today, unless the card names or details are missing (saved by an older version of the app).
  if (dates.includes(date) && (await readCardMeta()).size > 0 && !(await cardIndexNeeds(date))) return;

  const downloaded = await downloadDailyFile(file.url, date);
  // First, as card lookups may be waiting for it. The prices stand without it; the API covers the cards meanwhile.
  await saveCardIndex(date, downloaded.cards).catch((error) => reportSourceError("card details", error));
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

// One refresh at a time, and not more often than CHECK_EVERY_MS. Kept on the
// process: the Market page and the server's start each have their own bundle.
const SHARED = Symbol.for("theorist.daily-file");
const shared = globalThis as unknown as Record<symbol, { running: Promise<void> | null; lastCheck: number } | undefined>;
const daily = (shared[SHARED] ??= { running: null, lastCheck: 0 });

/** Saves today's prices and card details if Scryfall has a new daily file. Safe to call on every request. */
export function refreshDailyFile(): Promise<void> {
  if (daily.running) return daily.running;
  if (Date.now() - daily.lastCheck < CHECK_EVERY_MS) return Promise.resolve();
  daily.lastCheck = Date.now();
  daily.running = refresh()
    .catch((error) => {
      reportSourceError("price tracking", error);
      // Try again in 15 minutes rather than 3 hours.
      daily.lastCheck = Date.now() - CHECK_EVERY_MS + 15 * 60_000;
    })
    .finally(() => {
      daily.running = null;
    });
  return daily.running;
}

/** With yesterday's card details in hand, today's file waits this long after the start, so it doesn't slow the first pages. */
const START_DELAY_MS = 10 * 60_000;

/**
 * From the server's start, on The Theorist run on your own computer: reads the
 * saved card details into memory, then keeps the daily file up to date while
 * the app stays open, so EDHREC's lists find their cards without waiting on Scryfall.
 */
export function keepDailyFileFresh(): void {
  if (!savingOnComputer()) return;
  void openCardIndex().then((saved) => {
    if (saved) setTimeout(() => void refreshDailyFile(), START_DELAY_MS).unref();
    else awaitCardIndex(refreshDailyFile());
  });
  setInterval(() => void refreshDailyFile(), CHECK_EVERY_MS).unref();
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
