"use client";

import { motion } from "motion/react";
import { QUADRANT_COLORS } from "@/components/deck-beta/recommendations-panel";
import { ROLE_INFO, type Role } from "@/lib/deck-beta/roles";
import type { CardDetails } from "@/lib/types";
import { useHoverPreview } from "../card-link";
import { LazyCardImage } from "../deck-beta/lazy-card-image";
import { GameChangerTag } from "../game-changer-tag";

/** Each tile fades up a moment after the one before it, up to this many. */
const STAGGER_LIMIT = 12;

/**
 * A card the builder suggests: full color when it's in the binder, grayed out
 * when it isn't. Adding it sends it flying into the deck (it shares a layout
 * id with the deck's own copy, so Motion animates it across).
 */
export function BuildCard({
  card,
  ownedCopies,
  roles = [],
  reason,
  index,
  onAdd,
}: {
  card: CardDetails;
  ownedCopies: number;
  roles?: Role[];
  reason?: string;
  index: number;
  onAdd: (card: CardDetails) => void;
}) {
  const { trigger, preview } = useHoverPreview(card.name);
  const owned = ownedCopies > 0;
  return (
    <motion.li
      layoutId={`card:${card.name}`}
      initial={{ opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      exit={{ opacity: 0, transform: "scale(0.96)", transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: Math.min(index, STAGGER_LIMIT) * 0.03 }}
      className="group relative flex min-w-0 flex-col gap-2"
    >
      <button
        type="button"
        {...trigger}
        onClick={() => {
          trigger.onClick();
          onAdd(card);
        }}
        aria-label={`Add ${card.name} to the deck${owned ? "" : " (not in your binder)"}`}
        className="relative block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle text-left outline-offset-4"
      >
        <span className={`block h-full w-full transition-[filter,opacity] duration-200 ${owned ? "" : "opacity-55 grayscale"}`}>
          <LazyCardImage url={card.imageUrl} alt={card.name} />
        </span>
        <GameChangerTag name={card.name} className="absolute top-1.5 left-1.5 shadow" />
        <span
          aria-hidden
          className="absolute right-1.5 bottom-1.5 flex size-7 items-center justify-center rounded-full bg-foreground text-base leading-none text-background opacity-0 shadow-lg transition-[opacity,transform] duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100"
        >
          +
        </span>
      </button>
      {preview}
      <div className="min-w-0 px-0.5">
        <p className="truncate text-[13px] leading-tight font-medium" title={card.name}>
          {card.name}
        </p>
        <p className={`mt-0.5 text-[11px] ${owned ? "text-foreground/70" : "text-muted"}`}>
          {owned ? `In your binder${ownedCopies > 1 ? ` ×${ownedCopies}` : ""}` : "Not owned"}
          {reason && <span className="text-muted"> · {reason}</span>}
        </p>
        {roles.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1">
            {roles.slice(0, 3).map((r) => (
              <span key={r} className="inline-flex items-center gap-1 text-[10.5px] text-muted">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: QUADRANT_COLORS[ROLE_INFO[r].quadrant] }} />
                {ROLE_INFO[r].label}
              </span>
            ))}
          </p>
        )}
      </div>
    </motion.li>
  );
}
