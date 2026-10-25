"use client";

import { useState } from "react";
import { formatCount, formatPhp } from "@/lib/format";
import { showPrinting, useShownPrinting } from "@/lib/shown-printing";

/** Just what a tile shows, so hundreds of printings stay a small download. */
export interface PrintingTile {
  key: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  year?: string;
  imageUrl?: string;
  /** A larger image of this printing, shown at the top of the page when the tile is clicked. */
  largeImageUrl?: string;
  /** Its artwork alone, for the page background. */
  artUrl?: string;
  /** Where to buy it (TCGph), or its Scryfall page. */
  href?: string;
  pricePhp?: number;
  store?: string;
  finish?: string;
}

const FIRST = 18;
const STEP = 36;

/**
 * A grid of printings that starts small and grows on "Show more" (basic lands
 * have 800+). Clicking a printing shows it at the top of the page.
 */
export function PrintingGrid({ tiles, label, cardName }: { tiles: PrintingTile[]; label: string; cardName: string }) {
  const [shown, setShown] = useState(FIRST);
  const { printing } = useShownPrinting(cardName);
  const remaining = tiles.length - shown;

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {tiles.slice(0, shown).map((t) => (
          <li key={t.key}>
            <Tile tile={t} cardName={cardName} selected={printing?.key === t.key} />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setShown((n) => n + STEP)}
          className="mt-3 rounded-full border border-line-strong px-4 py-1.5 text-sm hover:border-accent/50"
        >
          Show {formatCount(Math.min(STEP, remaining))} more {label}
          <span className="text-muted"> ({formatCount(remaining)} left)</span>
        </button>
      )}
    </>
  );
}

function Tile({ tile: t, cardName, selected }: { tile: PrintingTile; cardName: string; selected: boolean }) {
  const large = t.largeImageUrl ?? t.imageUrl;
  const label = `${t.setName} · ${t.setCode} #${t.collectorNumber}`;
  const picture = (
    <>
      <div
        className={`aspect-[146/204] overflow-hidden rounded-[4.75%] bg-subtle  ${
          selected ? "ring-3 ring-accent/70" : ""
        }`}
      >
        {t.imageUrl && (
          // Plain <img>: Scryfall's image server sizes these already.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.imageUrl}
            alt={`${t.setName} printing`}
            width={146}
            height={204}
            loading="lazy"
            className="h-full w-full object-cover transition-opacity group-hover:opacity-85"
          />
        )}
      </div>
      <p className="mt-1.5 truncate text-xs font-medium" title={t.setName}>
        {t.setName}
      </p>
      <p className="truncate text-xs text-muted">
        {t.setCode} #{t.collectorNumber}
        {t.year && ` · ${t.year}`}
      </p>
    </>
  );

  return (
    <div className="min-w-0">
      {large ? (
        <button
          type="button"
          onClick={() => showPrinting(cardName, { key: t.key, label, imageUrl: large, artUrl: t.artUrl })}
          aria-pressed={selected}
          aria-label={`Show the ${label} printing at the top of the page`}
          title="Show this printing at the top of the page"
          className="group block w-full text-left"
        >
          {picture}
        </button>
      ) : (
        picture
      )}
      <div className="min-w-0 text-xs">
        {t.pricePhp !== undefined ? (
          <a
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            title="Buy on TCGph"
            className="block truncate hover:underline"
          >
            <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
              {formatPhp(t.pricePhp)}
            </span>{" "}
            <span className="text-muted">{t.store}</span>
            {t.finish && <span className="text-muted"> · {t.finish}</span>}
            <span className="text-muted"> ↗</span>
          </a>
        ) : (
          <p className="text-muted">Not in PH stores</p>
        )}
      </div>
    </div>
  );
}
