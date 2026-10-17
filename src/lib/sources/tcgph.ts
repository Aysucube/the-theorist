import * as cheerio from "cheerio";
import { cacheLife } from "next/cache";
import type {
  ListingBrief,
  TcgphListing,
  TcgphPrice,
  TcgphPrices,
  TcgphPrint,
  TcgphSummary,
} from "@/lib/types";
import { SourceError, sourceFetch } from "./http";

// TCGph has no public API. Its /card/<slug> page is server-rendered with every
// in-stock printing and store listing, so we read that page (and its few
// follow-on pages for heavily reprinted cards) per search and cache the result.
// robots.txt allows these pages; keep request volume low.
const SITE = "https://tcgph.com";
// Sol Ring, the most reprinted card, spans 4 pages.
const MAX_PAGES = 5;

export interface ParsedCardPage {
  /** Unknown slugs still return 200, but only real card pages carry schema.org Product data. */
  isCardPage: boolean;
  prints: TcgphPrint[];
  /** The next "?page=N" this page links to, if any. */
  nextPage: number | null;
}

function text(s: string | undefined) {
  return s?.replace(/\s+/g, " ").trim() ?? "";
}

/** Reads one TCGph card page. `pageUrl` is the card's base URL, used as a fallback link. */
export function parseCardPage(html: string, pageUrl: string, page = 1): ParsedCardPage {
  const $ = cheerio.load(html);

  const isCardPage = $('script[type="application/ld+json"]')
    .toArray()
    .some((el) => {
      try {
        return (JSON.parse($(el).text()) as { "@type"?: string })["@type"] === "Product";
      } catch {
        return false;
      }
    });

  // Each store link carries its data as attributes; group them by printing.
  const prints = new Map<string, TcgphPrint>();
  $('a[data-ga-event="store_click"]').each((_, el) => {
    const link = $(el);
    const printId = link.attr("data-card-print-id") ?? "";
    const priceCentavos = Number(link.attr("data-ga-price"));
    if (!printId || !Number.isFinite(priceCentavos)) return;

    let print = prints.get(printId);
    if (!print) {
      // The printing's details sit beside the listing list (<dl>).
      const block = link.closest("dl").parent();
      // Two links go to the printing: the image, then the set name.
      const printLink = block.find('a[href^="/cards/"]').filter((_, a) => $(a).find("img").length === 0);
      const [setCode, number] = block.find("p").eq(0).find("span").map((_, s) => text($(s).text())).get();
      const [finish, language] = block.find("p").eq(1).find("span").map((_, s) => text($(s).text())).get();
      print = {
        printId,
        setName: text(printLink.first().text()),
        setCode,
        collectorNumber: number?.replace(/^#/, ""),
        finish,
        language,
        url: printLink.first().attr("href") ? SITE + printLink.first().attr("href") : pageUrl,
        listings: [],
      };
      prints.set(printId, print);
    }

    const row = link.closest("dd");
    const condition = row.find("span[title]").first();
    const quantity = Number(row.find("span").not("[title]").first().text().replace(/\D/g, ""));
    const listing: TcgphListing = {
      listingId: link.attr("data-listing-id") ?? `${printId}-${print.listings.length}`,
      store: link.attr("data-ga-store") ?? text(link.closest("div").find("dt").text()),
      condition: text(condition.text()),
      conditionLabel: condition.attr("title"),
      quantity: quantity || undefined,
      pricePhp: priceCentavos / 100,
      url: link.attr("href") ?? pageUrl,
    };
    print.listings.push(listing);
  });

  const nextPage = $(`a[href$="?page=${page + 1}"]`).length > 0 ? page + 1 : null;
  return { isCardPage, prints: [...prints.values()], nextPage };
}

/** Adds one page's printings to the running total, skipping listings already seen. */
export function mergePrints(into: Map<string, TcgphPrint>, prints: TcgphPrint[]) {
  for (const print of prints) {
    const existing = into.get(print.printId);
    if (!existing) {
      into.set(print.printId, { ...print, listings: [...print.listings] });
      continue;
    }
    for (const listing of print.listings) {
      if (!existing.listings.some((l) => l.listingId === listing.listingId)) {
        existing.listings.push(listing);
      }
    }
  }
}

async function fetchPage(url: string): Promise<string | null> {
  const res = await sourceFetch("TCGph", url, "text/html");
  if (res.status === 404) return null;
  if (!res.ok) throw new SourceError("TCGph", `HTTP ${res.status}`);
  return res.text();
}

export async function getPrices(slug: string): Promise<TcgphPrices | null> {
  "use cache: remote";
  cacheLife("hours");

  const url = `${SITE}/card/${slug}`;
  const html = await fetchPage(url);
  if (!html) return null;

  let page = parseCardPage(html, url);
  if (!page.isCardPage) return null;

  const prints = new Map<string, TcgphPrint>();
  mergePrints(prints, page.prints);

  // Follow "?page=N" links one at a time while the current page links to the next one.
  while (page.nextPage && page.nextPage <= MAX_PAGES) {
    const nextHtml = await fetchPage(`${url}?page=${page.nextPage}`);
    if (!nextHtml) break;
    page = parseCardPage(nextHtml, url, page.nextPage);
    mergePrints(prints, page.prints);
  }

  return { url, prints: [...prints.values()] };
}

/** Every listing as one flat list with its printing attached, cheapest first. */
export function cheapestFirst(prices: TcgphPrices): TcgphPrice[] {
  return prices.prints
    .flatMap((print) => print.listings.map((listing) => ({ print, listing })))
    .sort((a, b) => a.listing.pricePhp - b.listing.pricePhp);
}

export function summarizePrices(prices: TcgphPrices): TcgphSummary {
  const brief = ({ print, listing }: TcgphPrice): ListingBrief => ({
    pricePhp: listing.pricePhp,
    store: listing.store,
    condition: listing.condition,
    conditionLabel: listing.conditionLabel,
    url: listing.url,
    printing:
      [print.setCode && `${print.setCode} #${print.collectorNumber}`, print.finish]
        .filter(Boolean)
        .join(" · ") || undefined,
  });

  const rows = cheapestFirst(prices);
  // Rows are cheapest first, so the first listing seen per store is that store's cheapest.
  const byStore = new Map<string, TcgphPrice>();
  for (const row of rows) {
    if (!byStore.has(row.listing.store)) byStore.set(row.listing.store, row);
  }

  return {
    url: prices.url,
    cheapest: rows[0] && brief(rows[0]),
    stores: byStore.size,
    listings: rows.length,
    byStore: [...byStore.values()].map(brief),
  };
}
