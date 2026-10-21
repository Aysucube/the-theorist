// Builds the shared market-trends file from MTGJSON's 90-day price history
// (TCGplayer market prices). Run daily on GitHub by
// .github/workflows/market-trends.yml; every copy of the app reads the result.
//
//   node scripts/build-market-trends.ts out/trends.json
//
// To try it with files you already downloaded from https://mtgjson.com:
//
//   node scripts/build-market-trends.ts out.json --prices AllPrices.json.gz --cards AllIdentifiers.json.gz
//
// Runs on Node 24 without a build step, so it only uses Node's own modules and
// imports the app's trend code by file path.
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { createGunzip } from "node:zlib";
import { addDays, dateOnOrBefore, scryfallImage, surge, topSurges, WINDOWS } from "../src/lib/trends/compute.ts";
import { dataEntries } from "../src/lib/trends/json-stream.ts";
import type { MarketTrends, TrendCard, TrendWindow } from "../src/lib/trends/types.ts";

const MTGJSON = "https://mtgjson.com/api/v5";
const USER_AGENT = "TheTheorist/0.1 (daily market trends for PH Commander players)";
/** Printings kept per window before looking up their names; several printings of one card often surge together. */
const CANDIDATES = 400;
const WINDOW_NAMES = Object.keys(WINDOWS) as TrendWindow[];

interface Candidate {
  uuid: string;
  /** Its price history, for the card's chart. */
  history: Record<string, number>;
  /** The latest date this printing has a price for. */
  last: string;
  fromUsd: number;
  toUsd: number;
  change: number;
}

interface CardEntry {
  name?: string;
  setCode?: string;
  isOnlineOnly?: boolean;
  isFunny?: boolean;
  legalities?: { commander?: string };
  identifiers?: { scryfallId?: string };
}

function option(name: string, fallback: string) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

/** A gzipped file, from a URL or a path, as a stream of text. */
async function gzipText(source: string): Promise<AsyncIterable<string> & { destroy(): void }> {
  let raw: NodeJS.ReadableStream;
  if (/^https?:/.test(source)) {
    const res = await fetch(source, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok || !res.body) throw new Error(`${source}: HTTP ${res.status}`);
    raw = Readable.fromWeb(res.body as ReadableStream);
  } else {
    raw = createReadStream(source);
  }
  const text = raw.pipe(createGunzip());
  text.setEncoding("utf8");
  return text;
}

/** Pass 1: every printing's TCGplayer price history, kept only where it surged. */
async function findSurges(source: string) {
  const candidates: Record<TrendWindow, Candidate[]> = { day: [], week: [], month: [] };
  let latest = "";
  let printings = 0;

  for await (const [uuid, value] of dataEntries(await gzipText(source))) {
    const history = (value as { paper?: { tcgplayer?: { retail?: { normal?: Record<string, number> } } } }).paper?.tcgplayer
      ?.retail?.normal;
    if (!history) continue;
    printings++;
    const dates = Object.keys(history);
    const last = dates.reduce((a, b) => (b > a ? b : a));
    if (last > latest) latest = last;

    for (const window of WINDOW_NAMES) {
      const { days, slackDays } = WINDOWS[window];
      const target = addDays(last, -days);
      const since = dateOnOrBefore(dates, target, addDays(target, -slackDays));
      if (!since) continue;
      const change = surge(history[since], history[last]);
      if (change !== null) candidates[window].push({ uuid, history, last, fromUsd: history[since], toUsd: history[last], change });
    }
  }

  // Only printings priced on the latest day count; the rest are stale listings.
  for (const window of WINDOW_NAMES) {
    candidates[window] = candidates[window]
      .filter((c) => c.last === latest)
      .sort((a, b) => b.change - a.change)
      .slice(0, CANDIDATES);
  }
  console.log(`Read ${printings} printings' prices up to ${latest}.`);
  return { latest, candidates };
}

/** Pass 2: names, sets and Scryfall ids for just the printings that surged. */
async function lookUpCards(source: string, wanted: Set<string>) {
  const cards = new Map<string, CardEntry>();
  const stream = await gzipText(source);
  for await (const [uuid, value] of dataEntries(stream, (id) => wanted.has(id))) {
    cards.set(uuid, value as CardEntry);
    // Every printing found: stop downloading the rest of the file.
    if (cards.size === wanted.size) {
      stream.destroy();
      break;
    }
  }
  return cards;
}

async function main() {
  const out = process.argv[2];
  if (!out || out.startsWith("--")) throw new Error("Usage: node scripts/build-market-trends.ts <output.json> [--prices <file|url>] [--cards <file|url>]");

  const { latest, candidates } = await findSurges(option("--prices", `${MTGJSON}/AllPrices.json.gz`));
  const wanted = new Set(WINDOW_NAMES.flatMap((w) => candidates[w].map((c) => c.uuid)));
  const cards = await lookUpCards(option("--cards", `${MTGJSON}/AllIdentifiers.json.gz`), wanted);

  const windows: MarketTrends["windows"] = {};
  for (const window of WINDOW_NAMES) {
    const shown: TrendCard[] = [];
    for (const c of candidates[window]) {
      const card = cards.get(c.uuid);
      const scryfallId = card?.identifiers?.scryfallId;
      // Commander-legal paper cards only, as everywhere else in the app. (MTGJSON writes "Legal".)
      if (!card?.name || card.legalities?.commander?.toLowerCase() !== "legal" || card.isOnlineOnly || card.isFunny) continue;
      shown.push({
        name: card.name,
        setCode: card.setCode,
        imageUrl: scryfallId ? scryfallImage(scryfallId) : undefined,
        fromUsd: c.fromUsd,
        toUsd: c.toUsd,
        change: c.change,
        // The last 30 days, for the card's chart.
        history: Object.entries(c.history)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-30)
          .map(([date, usd]) => ({ date, usd })),
      });
    }
    if (shown.length > 0) windows[window] = { since: addDays(latest, -WINDOWS[window].days), cards: topSurges(shown) };
  }

  const trends: MarketTrends = { source: "mtgjson", pricesFrom: latest, windows };
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await writeFile(out, JSON.stringify(trends, null, 1));
  for (const window of WINDOW_NAMES) console.log(`${window}: ${windows[window]?.cards.length ?? 0} surging cards`);
}

await main();
