import { formatDate } from "@/lib/format";
import type { Ruling } from "@/lib/types";

/**
 * A card's rulings in a box that scrolls when there are more than fit, so a
 * card with a dozen rulings doesn't push everything else down the page.
 */
export function RulingsList({ rulings, size = "md" }: { rulings: Ruling[]; size?: "sm" | "md" }) {
  if (rulings.length === 0) {
    return <p className="text-sm text-zinc-500">No official rulings for this card.</p>;
  }
  return (
    <ol
      // Focusable so keyboard users can scroll it too.
      tabIndex={0}
      aria-label="Rulings"
      className={`${
        size === "sm" ? "max-h-44" : "max-h-80"
      } divide-y divide-zinc-200 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-zinc-50 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/60`}
    >
      {rulings.map((ruling, i) => (
        <li key={i} className="px-3 py-2.5">
          <p className="text-sm leading-6 whitespace-pre-line">{ruling.comment}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDate(ruling.publishedAt)} · {ruling.source === "wotc" ? "Wizards of the Coast" : "Scryfall note"}
          </p>
        </li>
      ))}
    </ol>
  );
}
