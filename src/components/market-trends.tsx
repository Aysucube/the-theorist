import { after, connection } from "next/server";
import { formatDate, formatUsd } from "@/lib/format";
import { describeRate, usdInPhp, type UsdRate } from "@/lib/fx";
import { findUsdToPhp } from "@/lib/sources/fx";
import { SURGE_RULES } from "@/lib/trends/compute";
import { readLocalTrends, refreshLocalTrends } from "@/lib/trends/local";
import { getSharedTrends } from "@/lib/trends/shared";
import type { MarketTrends } from "@/lib/trends/types";
import { SourceMessage } from "./panel";
import { PriceHistoryExplorer } from "./price-history-explorer";
import { TrendTabs } from "./trend-tabs";

/** The shared file is used while it's at most this many days old. */
const SHARED_MAX_AGE_DAYS = 4;

function daysOld(isoDate: string) {
  return (Date.now() - Date.parse(`${isoDate}T00:00:00Z`)) / 86_400_000;
}

/**
 * Cards whose market price is surging, with their cheapest Philippine copy.
 * Uses the shared daily file built on GitHub when it can be read, otherwise
 * this app's own daily tracking (which it keeps up to date in the background).
 * Market prices are US dollars, shown in pesos at the day's exchange rate.
 */
export async function MarketTrendsSection() {
  // Request time only: the trends change daily and local tracking reads files.
  await connection();

  // Always save today's prices after this page is sent (if Scryfall has a new
  // daily file): they build the history explorer even when the shared file is used.
  after(() => refreshLocalTrends());

  const [shared, local, rate] = await Promise.all([getSharedTrends(), readLocalTrends(), findUsdToPhp()]);
  const trends =
    shared && daysOld(shared.pricesFrom) <= SHARED_MAX_AGE_DAYS
      ? shared
      : local.trends && Object.keys(local.trends.windows).length > 0
        ? local.trends
        : null;

  return (
    <div className="flex flex-col gap-10">
      {trends ? (
        <Trends trends={trends} rate={rate} />
      ) : (
        <SourceMessage>
          {!local.trackingSince
            ? "Saving today’s market prices to start tracking. Surging cards show up from tomorrow."
            : `Tracking market prices since ${formatDate(local.trackingSince)}. Surging cards show up once there’s a second day of prices, so check back tomorrow.`}
        </SourceMessage>
      )}
      <section className="surface rounded-2xl p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Price history</h2>
        <p className="mb-4 text-sm text-muted">
          Compare any two days the app has saved and find the biggest price moves between them.
        </p>
        <PriceHistoryExplorer rate={rate} />
      </section>
      <RateNote rate={rate} />
    </div>
  );
}

function Trends({ trends, rate }: { trends: MarketTrends; rate: UsdRate | null }) {
  return (
    <div className="flex flex-col gap-3">
      <TrendTabs trends={trends} rate={rate} />
      <p className="text-xs text-muted">
        {trends.source === "mtgjson"
          ? "Market prices: TCGplayer, from MTGJSON’s daily price history."
          : "Market prices: TCGplayer, from Scryfall, saved daily by this app."}{" "}
        Only Commander-legal cards that cost at least {usdInPhp(SURGE_RULES.minNowUsd, rate)}
        {rate ? ` (${formatUsd(SURGE_RULES.minNowUsd)})` : ""} and rose by at least {Math.round(SURGE_RULES.minChange * 100)}%.
      </p>
    </div>
  );
}

/** Where the pesos come from: the rate, its day and its source. */
function RateNote({ rate }: { rate: UsdRate | null }) {
  if (!rate) {
    return (
      <p className="text-xs text-muted">
        Prices are in US dollars: the exchange rate couldn’t be loaded just now, so they couldn’t be shown in pesos.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted">
      Converted at {describeRate(rate)} ({formatDate(rate.date)},{" "}
      {rate.source === "European Central Bank" ? (
        <a href="https://www.frankfurter.app" target="_blank" rel="noopener noreferrer" className="link">
          European Central Bank via Frankfurter
        </a>
      ) : (
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="link">
          Rates by Exchange Rate API
        </a>
      )}
      ). These are US market prices in pesos, a guide to value; what Philippine stores charge is under each card.
    </p>
  );
}
