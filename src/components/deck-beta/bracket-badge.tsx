"use client";

import { BRACKET_INFO, bracketLabel, type Bracket, type BracketReport } from "@/lib/deck-beta/bracket";

/** Each bracket's color, from casual (cool) to competitive (hot). */
export const BRACKET_STYLE: Record<Bracket, string> = {
  1: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  2: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  3: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  4: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300",
  5: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300",
};

/** "Bracket 2 nearing 3", with the reasons on hover. Click to see them in full. */
export function BracketBadge({ report, checking, onClick }: { report: BracketReport; checking: boolean; onClick: () => void }) {
  const why = [...report.reasons.map((r) => r.text), ...report.nearingReasons].join("\n");
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${BRACKET_INFO[report.bracket].name}. ${why}\nClick for details and how to change it.`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold tracking-normal ${BRACKET_STYLE[report.bracket]} hover:ring-2 hover:ring-foreground/60`}
    >
      {bracketLabel(report)}
      {checking && <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />}
      <span className="sr-only">{checking ? " (still checking combos)" : ""}: details</span>
    </button>
  );
}
