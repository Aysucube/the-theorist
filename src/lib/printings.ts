// Pairs every printing of a card (from Scryfall) with what PH stores have of
// it (from TCGph), so a card page can show the cheapest copy of each printing.
import type { Printing, TcgphListing, TcgphPrices, TcgphPrint } from "./types";

export interface PrintingOffer {
  pricePhp: number;
  store: string;
  condition: string;
  conditionLabel?: string;
  /** e.g. "Foil", or "Foil · JP" for a non-English copy. */
  finish?: string;
  url: string;
}

export interface PricedPrinting {
  key: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  releasedAt?: string;
  rarity?: string;
  imageUrl?: string;
  scryfallUrl?: string;
  /** This printing's page on TCGph, when a store has it. */
  tcgphUrl?: string;
  /** The cheapest in-stock copy of this printing, any finish. */
  cheapest?: PrintingOffer;
  /** In-stock listings of this printing across all stores and finishes. */
  listings: number;
}

export interface PricedPrintings {
  /** Printings some PH store has, cheapest first. */
  inStock: PricedPrinting[];
  /** Printings no PH store lists right now, newest first. */
  notInStock: PricedPrinting[];
}

const printingKey = (setCode: string | undefined, number: string | undefined) =>
  `${(setCode ?? "").toUpperCase()}#${number ?? ""}`;

function finishLabel(print: TcgphPrint) {
  const language = print.language && print.language !== "EN" ? print.language : undefined;
  return [print.finish, language].filter(Boolean).join(" · ") || undefined;
}

export function pricePrintings(printings: Printing[], prices: TcgphPrices | null): PricedPrintings {
  // TCGph lists each finish (and language) of a printing separately; group them by set and number.
  const stock = new Map<string, TcgphPrint[]>();
  for (const print of prices?.prints ?? []) {
    if (print.listings.length === 0) continue;
    const key = printingKey(print.setCode, print.collectorNumber);
    stock.set(key, [...(stock.get(key) ?? []), print]);
  }

  const priced = (base: Omit<PricedPrinting, "cheapest" | "listings" | "tcgphUrl">): PricedPrinting => {
    const prints = stock.get(base.key) ?? [];
    let cheapest: { listing: TcgphListing; print: TcgphPrint } | undefined;
    for (const print of prints) {
      for (const listing of print.listings) {
        if (!cheapest || listing.pricePhp < cheapest.listing.pricePhp) cheapest = { listing, print };
      }
    }
    return {
      ...base,
      imageUrl: base.imageUrl ?? prints.find((p) => p.imageUrl)?.imageUrl,
      tcgphUrl: cheapest?.print.url,
      listings: prints.reduce((sum, p) => sum + p.listings.length, 0),
      cheapest: cheapest && {
        pricePhp: cheapest.listing.pricePhp,
        store: cheapest.listing.store,
        condition: cheapest.listing.condition,
        conditionLabel: cheapest.listing.conditionLabel,
        finish: finishLabel(cheapest.print),
        url: cheapest.listing.url,
      },
    };
  };

  const all = printings.map((p) =>
    priced({
      key: printingKey(p.setCode, p.collectorNumber),
      setCode: p.setCode,
      setName: p.setName,
      collectorNumber: p.collectorNumber,
      releasedAt: p.releasedAt,
      rarity: p.rarity,
      imageUrl: p.imageUrl,
      scryfallUrl: p.scryfallUrl,
    }),
  );

  // Printings TCGph has that Scryfall didn't list (rare, e.g. a set code that differs).
  const known = new Set(all.map((p) => p.key));
  for (const [key, prints] of stock) {
    if (known.has(key)) continue;
    const first = prints[0];
    all.push(
      priced({
        key,
        setCode: first.setCode ?? "",
        setName: first.setName,
        collectorNumber: first.collectorNumber ?? "",
        imageUrl: first.imageUrl,
      }),
    );
  }

  return {
    inStock: all.filter((p) => p.cheapest).sort((a, b) => a.cheapest!.pricePhp - b.cheapest!.pricePhp),
    notInStock: all.filter((p) => !p.cheapest),
  };
}
