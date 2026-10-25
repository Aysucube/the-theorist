// The US dollar in Philippine pesos: European Central Bank reference rates via
// Frankfurter (updated each working day), or ExchangeRate-API's open rates if
// Frankfurter can't be reached. Cached for hours; a failure isn't cached.
import { cacheLife } from "next/cache";
import { parseExchangeRateApi, parseFrankfurter, type UsdRate } from "@/lib/fx";
import { SourceError, USER_AGENT } from "./http";

const SOURCES: [string, (json: unknown) => UsdRate | null][] = [
  ["https://api.frankfurter.dev/v1/latest?base=USD&symbols=PHP", parseFrankfurter],
  ["https://open.er-api.com/v6/latest/USD", parseExchangeRateApi],
];

export async function getUsdToPhp(): Promise<UsdRate> {
  "use cache: remote";
  cacheLife("hours");

  for (const [url, parse] of SOURCES) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const rate = res.ok ? parse(await res.json()) : null;
      if (rate) return rate;
    } catch {
      // Try the next source.
    }
  }
  throw new SourceError("Exchange rate", "no source answered");
}

/** The rate, or null when no source can be reached (prices then stay in dollars). */
export async function findUsdToPhp(): Promise<UsdRate | null> {
  try {
    return await getUsdToPhp();
  } catch {
    return null;
  }
}
