"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatCount } from "@/lib/format";
import type { EdhrecTheme } from "@/lib/types";

/** Themes shown before "Show all", most popular first. */
const POPULAR = 30;

/**
 * Chips for EDHREC's deck themes ("Tokens", "Aristocrats", ...), the popular
 * ones first, with a filter box for the other few hundred. Picking one opens
 * its commanders and cards below.
 */
export function ThemePicker({ themes, selected }: { themes: EdhrecTheme[]; selected?: string }) {
  const id = useId();
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);

  const query = filter.trim().toLowerCase();
  const matches = query ? themes.filter((t) => t.name.toLowerCase().includes(query)) : themes;
  const shown = query || showAll ? matches : matches.slice(0, POPULAR);
  // Keep the chosen theme visible even when it isn't among the popular ones.
  const chosen = themes.find((t) => t.slug === selected);
  const list = chosen && !shown.includes(chosen) ? [chosen, ...shown] : shown;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={id} className="sr-only">
          Filter themes
        </label>
        <input
          id={id}
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${formatCount(themes.length)} themes, e.g. “elves” or “landfall”`}
          className="h-10 w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {!query && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-amber-700 hover:underline dark:text-amber-400"
          >
            {showAll ? "Show popular themes only" : `Show all ${formatCount(themes.length)} themes`}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-zinc-500">No themes match “{filter}”.</p>
      ) : (
        <ul className="flex max-h-72 flex-wrap gap-2 overflow-y-auto">
          {list.map((theme) => {
            const active = theme.slug === selected;
            return (
              <li key={theme.slug}>
                <Link
                  href={{ pathname: "/", query: { theme: theme.slug }, hash: "theme" }}
                  prefetch={false}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                    active
                      ? "border-amber-500 bg-amber-500 text-zinc-950"
                      : "border-zinc-300 hover:border-amber-500 dark:border-zinc-700"
                  }`}
                >
                  {theme.name}
                  <span className={`text-xs tabular-nums ${active ? "text-zinc-800" : "text-zinc-500"}`}>
                    {formatCount(theme.numDecks)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
