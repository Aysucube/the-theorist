import * as cheerio from "cheerio";
import { cacheLife } from "next/cache";
import type { TcgphListing, TcgphPrice, TcgphPrices, TcgphPrint } from "@/lib/types";
import { SourceError, USER_AGENT } from "./http";

// TCGph has no public API. Its /card/<slug> page is server-rendered with every
// in-stock printing and store listing, so we read that page (and its few
// follow-on pages for heavily reprinted cards) per search and cache the result.
// robots.txt allows these pages; keep request volume low.
const SITE = "https://tcgph.com";
// Sol Ring, the most reprinted card, spans 4 pages.
const MAX_PAGES = 5;

function text(s: string | undefined) {
  return s?.replace(/\s+/g, " ").trim() ?? "";
}

async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new SourceError("TCGph", `HTTP ${res.status}`);
  return cheerio.load(await res.text());
}

/** Unknown slugs still return 200, but only real card pages carry schema.org Product data. */
function isCardPage($: cheerio.CheerioAPI) {
  return $('script[type="application/ld+json"]')
    .toArray()
    .some((el) => {
      try {
        return (JSON.parse($(el).text()) as { "@type"?: string })["@type"] === "Product";
      } catch {
        return false;
      }
    });
}

/** Each store link carries its data as attributes; group them by printing. */
function collectListings($: cheerio.CheerioAPI, prints: Map<string, TcgphPrint>, pageUrl: string) {
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

    const listingId = link.attr("data-listing-id") ?? `${printId}-${print.listings.length}`;
    if (print.listings.some((l) => l.listingId === listingId)) return;

    const row = link.closest("dd");
    const condition = row.find("span[title]").first();
    const quantity = Number(row.find("span").not("[title]").first().text().replace(/\D/g, ""));
    const listing: TcgphListing = {
      listingId,
      store: link.attr("data-ga-store") ?? text(link.closest("div").find("dt").text()),
      condition: text(condition.text()),
      conditionLabel: condition.attr("title"),
      quantity: quantity || undefined,
      pricePhp: priceCentavos / 100,
      url: link.attr("href") ?? pageUrl,
    };
    print.listings.push(listing);
  });
}

export async function getPrices(slug: string): Promise<TcgphPrices | null> {
  "use cache";
  cacheLife("hours");

  const url = `${SITE}/card/${slug}`;
  const first = await fetchPage(url);
  if (!first || !isCardPage(first)) return null;

  const prints = new Map<string, TcgphPrint>();
  collectListings(first, prints, url);

  // Follow "?page=N" links one at a time while the current page links to the next one.
  let $ = first;
  for (let page = 2; page <= MAX_PAGES; page++) {
    if ($(`a[href$="?page=${page}"]`).length === 0) break;
    const next = await fetchPage(`${url}?page=${page}`);
    if (!next) break;
    collectListings(next, prints, url);
    $ = next;
  }

  return { url, prints: [...prints.values()] };
}

/** Every listing as one flat list with its printing attached, cheapest first. */
export function cheapestFirst(prices: TcgphPrices): TcgphPrice[] {
  return prices.prints
    .flatMap((print) => print.listings.map((listing) => ({ print, listing })))
    .sort((a, b) => a.listing.pricePhp - b.listing.pricePhp);
}
