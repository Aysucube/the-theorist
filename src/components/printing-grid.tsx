"use client";

import { useState } from "react";
import { formatCount, formatPhp } from "@/lib/format";

/** Just what a tile shows, so hundreds of printings stay a small download. */
export interface PrintingTile {
  key: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  year?: string;
  imageUrl?: string;
  href?: string;
  pricePhp?: number;
  store?: string;
  finish?: string;
}

const FIRST = 18;
const STEP = 36;

/** A grid of printings that starts small and grows on "Show more" (basic lands have 800+). */
export function PrintingGrid({ tiles, label }: { tiles: PrintingTile[]; label: string }) {
  const [shown, setShown] = useState(FIRST);
  const remaining = tiles.length - shown;

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {tiles.slice(0, shown).map((t) => (
          <li key={t.key}>
            <Tile tile={t} />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setShown((n) => n + STEP)}
          className="mt-3 rounded-full border border-zinc-300 px-4 py-1.5 text-sm hover:border-amber-500 dark:border-zinc-700"
        >
          Show {formatCount(Math.min(STEP, remaining))} more {label}
          <span className="text-zinc-500"> ({formatCount(remaining)} left)</span>
        </button>
      )}
    </>
  );
}

function Tile({ tile: t }: { tile: PrintingTile }) {
  const body = (
    <>
      <div className="aspect-[146/204] overflow-hidden rounded-[4.75%] bg-zinc-200 dark:bg-zinc-800">
        {t.imageUrl && (
          // Plain <img>: Scryfall's image server sizes these already.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.imageUrl}
            alt={`${t.setName} printing`}
            width={146}
            height={204}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="mt-1.5 min-w-0 text-xs">
        <p className="truncate font-medium" title={t.setName}>
          {t.setName}
        </p>
        <p className="truncate text-zinc-500">
          {t.setCode} #{t.collectorNumber}
          {t.year && ` · ${t.year}`}
        </p>
        {t.pricePhp !== undefined ? (
          <p className="truncate">
            <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
              {formatPhp(t.pricePhp)}
            </span>{" "}
            <span className="text-zinc-600 dark:text-zinc-400">{t.store}</span>
            {t.finish && <span className="text-zinc-500"> · {t.finish}</span>}
          </p>
        ) : (
          <p className="text-zinc-500">Not in PH stores</p>
        )}
      </div>
    </>
  );
  return t.href ? (
    <a href={t.href} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">
      {body}
    </a>
  ) : (
    body
  );
}
