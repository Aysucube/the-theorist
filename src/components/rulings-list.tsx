import { formatDate } from "@/lib/format";
import type { Ruling } from "@/lib/types";

/**
 * A card's rulings in a box that scrolls when there are more than fit, so a
 * card with a dozen rulings doesn't push everything else down the page.
 */
export function RulingsList({ rulings, size = "md" }: { rulings: Ruling[]; size?: "sm" | "md" }) {
  if (rulings.length === 0) {
    return <p className="text-sm text-muted">No official rulings for this card.</p>;
  }
  return (
    <ol
      // Focusable so keyboard users can scroll it too.
      tabIndex={0}
      aria-label="Rulings"
      className={`${
        size === "sm" ? "max-h-44" : "max-h-80"
      } divide-y divide-line overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent/70   `}
    >
      {rulings.map((ruling, i) => (
        <li key={i} className="px-3 py-2.5">
          <p className="text-sm leading-6 whitespace-pre-line">{ruling.comment}</p>
          <p className="mt-1 text-xs text-muted">
            {formatDate(ruling.publishedAt)} · {ruling.source === "wotc" ? "Wizards of the Coast" : "Scryfall note"}
          </p>
        </li>
      ))}
    </ol>
  );
}
