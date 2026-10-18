import { NextResponse, type NextRequest } from "next/server";
import { clientAddress, createRateLimiter } from "@/lib/rate-limit";

// Every card lookup can trigger requests to Scryfall, EDHREC and TCGph, which
// have no paid API agreement with us. These limits keep any one visitor (or
// script) from turning this app into a scraper. Cached answers are cheap, but
// counted too: the proxy can't tell a cache hit from a miss.
const LIMITS = {
  // A 150-card deck priced twice in ten minutes, plus some "Check ₱" clicks.
  price: createRateLimiter({ limit: 350, windowMs: 10 * 60_000 }),
  // Debounced typing in the search box.
  autocomplete: createRateLimiter({ limit: 120, windowMs: 60_000 }),
  // Hover cards on card links: a person pausing over links, not a sweep.
  preview: createRateLimiter({ limit: 120, windowMs: 60_000 }),
  // Card types and costs for a whole deck, one request per deck change.
  info: createRateLimiter({ limit: 30, windowMs: 60_000 }),
  // Opening card pages, which look up all three sources.
  card: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  // Deck beta: a deck's details now and then, and EDHREC pairings per card clicked.
  deckBeta: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  // Picking deck themes on the front page (each looks up EDHREC and Scryfall).
  theme: createRateLimiter({ limit: 60, windowMs: 60_000 }),
};

function bucket({ pathname, searchParams }: URL): keyof typeof LIMITS | null {
  if (pathname === "/api/price") return "price";
  if (pathname === "/api/autocomplete") return "autocomplete";
  if (pathname === "/api/preview") return "preview";
  if (pathname === "/api/cards/info") return "info";
  if (pathname === "/card") return "card";
  if (pathname.startsWith("/api/deck-beta/")) return "deckBeta";
  if (pathname === "/" && searchParams.has("theme")) return "theme";
  return null;
}

export function proxy(request: NextRequest) {
  const name = bucket(request.nextUrl);
  // No exemptions by request header: a client can send any header it likes.
  // (Card links don't prefetch, so real visitors don't spend their limit on prefetches.)
  if (!name) return NextResponse.next();

  const result = LIMITS[name](clientAddress(request.headers));
  if (result.ok) return NextResponse.next();

  const headers = { "Retry-After": String(result.retryAfterSeconds) };
  const message = `Too many requests. Please wait ${result.retryAfterSeconds} seconds and try again.`;
  // Pages get a plain-text answer; API routes get JSON.
  return name === "card" || name === "theme"
    ? new NextResponse(message, { status: 429, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } })
    : NextResponse.json({ error: message }, { status: 429, headers });
}

export const config = {
  matcher: ["/", "/api/price", "/api/autocomplete", "/api/preview", "/api/cards/info", "/card", "/api/deck-beta/:path*"],
};
