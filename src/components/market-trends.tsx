import { after, connection } from "next/server";
import { formatDate } from "@/lib/format";
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
 */
export async function MarketTrendsSection() {
  // Request time only: the trends change daily and local tracking reads files.
  await connection();

  // Always save today's prices after this page is sent (if Scryfall has a new
  // daily file): they build the history explorer even when the shared file is used.
  after(() => refreshLocalTrends());

  const shared = await getSharedTrends();
  const local = await readLocalTrends();
  const trends =
    shared && daysOld(shared.pricesFrom) <= SHARED_MAX_AGE_DAYS
      ? shared
      : local.trends && Object.keys(local.trends.windows).length > 0
        ? local.trends
        : null;

  return (
    <div className="flex flex-col gap-10">
      {trends ? (
        <Trends trends={trends} />
      ) : (
        <SourceMessage>
          {!local.trackingSince
            ? "Saving today’s market prices to start tracking. Surging cards show up from tomorrow."
            : `Tracking market prices since ${formatDate(local.trackingSince)}. Surging cards show up once there’s a second day of prices, so check back tomorrow.`}
        </SourceMessage>
      )}
      <section>
        <h3 className="text-lg font-semibold">Price history</h3>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Compare any two days the app has saved and find the biggest price moves between them.
        </p>
        <PriceHistoryExplorer />
      </section>
    </div>
  );
}

function Trends({ trends }: { trends: MarketTrends }) {
  return (
    <div className="flex flex-col gap-3">
      <TrendTabs trends={trends} />
      <p className="text-xs text-zinc-500">
        {trends.source === "mtgjson"
          ? "Market prices: TCGplayer, from MTGJSON’s daily price history."
          : "Market prices: TCGplayer, from Scryfall, saved daily by this app."}{" "}
        Only Commander-legal cards that cost at least $2 and rose by at least 10%.
      </p>
    </div>
  );
}
