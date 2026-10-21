import { connection, type NextRequest } from "next/server";
import { MAX_LIMIT, priceHistory } from "@/lib/trends/history";
import { reportSourceError } from "@/lib/sources/http";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/trends/history?from=2026-10-01&to=2026-10-22&dir=up&sort=pct&min=2&limit=30
// The biggest price moves between two days this app saved prices for, with each card's daily prices.
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const direction = params.get("dir") === "down" ? "down" : "up";
  const sort = params.get("sort") === "usd" ? "usd" : "pct";
  const minUsd = Number(params.get("min") ?? 2);
  const limit = Number(params.get("limit") ?? 30);
  if ((from && !DATE.test(from)) || (to && !DATE.test(to)) || !Number.isFinite(minUsd) || minUsd < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return Response.json({ error: "Check the dates (YYYY-MM-DD), min price and limit." }, { status: 400 });
  }

  try {
    return Response.json(await priceHistory({ from, to, direction, sort, minUsd, limit }));
  } catch (error) {
    const detail = reportSourceError("api/trends/history", error);
    return Response.json({ error: "Couldn't read the saved price history.", detail }, { status: 500 });
  }
}
