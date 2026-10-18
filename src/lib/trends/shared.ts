// The shared daily trends file, built on GitHub by .github/workflows/market-trends.yml
// from MTGJSON's 90-day price history. Every copy of the app can read it while
// the repository is public; until then this returns null and the app falls
// back to its own tracking (local.ts).
import { cacheLife } from "next/cache";
import { USER_AGENT } from "@/lib/sources/http";
import type { MarketTrends } from "./types.ts";

/** Override with TRENDS_URL, e.g. for a fork or a separate public data repository. */
const DEFAULT_URL = "https://raw.githubusercontent.com/Aysucube/the-theorist/trends-data/trends.json";

function isMarketTrends(value: unknown): value is MarketTrends {
  const t = value as MarketTrends;
  return (
    t?.source === "mtgjson" &&
    typeof t.pricesFrom === "string" &&
    typeof t.windows === "object" &&
    Object.values(t.windows).every((w) => typeof w?.since === "string" && Array.isArray(w.cards))
  );
}

/** The shared trends, or null if they can't be read (private repository, offline, not built yet). */
export async function getSharedTrends(): Promise<MarketTrends | null> {
  "use cache: remote";
  cacheLife("hours");

  try {
    const res = await fetch(process.env.TRENDS_URL || DEFAULT_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isMarketTrends(body) ? body : null;
  } catch {
    return null;
  }
}
