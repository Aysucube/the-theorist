"use client";

import { AnimatePresence, motion } from "motion/react";
import { FlexTag } from "@/components/deck-beta/template-bits";
import type { Category } from "@/lib/deck-beta/roles";
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
  categories = [],
  reason,
  index,
  flies = true,
  added = false,
  onAdd,
  onTakeOut,
}: {
  card: CardDetails;
  ownedCopies: number;
  /** The template categories it fills; two or more earn it the flexibility tag. */
  categories?: Category[];
  reason?: string;
  index: number;
  /** Shares a layout id with the deck's copy; off when the card shows twice, so only one of them flies in. */
  flies?: boolean;
  /** In the deck already, on a list that holds its place: it stays where it is, marked. */
  added?: boolean;
  onAdd: (card: CardDetails) => void;
  /** For a list that holds its place: takes a card marked as added back out. */
  onTakeOut?: (name: string) => void;
}) {
  const { trigger, preview } = useHoverPreview(card.name);
  const { onPointerEnter, onPointerLeave, ...focus } = trigger;
  const owned = ownedCopies > 0;
  return (
    <motion.li
      layoutId={flies && !added ? `card:${card.name}` : undefined}
      initial={{ opacity: 0, transform: onTakeOut ? "translateY(0px)" : "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      exit={{ opacity: 0, transform: "scale(0.96)", transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: Math.min(index, STAGGER_LIMIT) * 0.03 }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="group relative flex min-w-0 flex-col gap-2"
    >
      <button
        type="button"
        {...focus}
        onClick={() => {
          trigger.onClick();
          if (added) onTakeOut?.(card.name);
          else onAdd(card);
        }}
        aria-label={added ? `Take ${card.name} out of the deck` : `Add ${card.name} to the deck${owned ? "" : " (not in your binder)"}`}
        className="relative block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle text-left outline-offset-4"
      >
        <span className={`block h-full w-full transition-[filter,opacity] duration-200 ${added ? "opacity-30" : owned ? "" : "opacity-55 grayscale"}`}>
          <LazyCardImage url={card.imageUrl} alt={card.name} />
        </span>
        <GameChangerTag name={card.name} className="absolute top-1.5 left-1.5 shadow" />
        {added && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-background/85 px-2.5 py-1 text-xs font-medium text-accent">✓ In your deck</span>
          </span>
        )}
        <span
          aria-hidden
          className="absolute right-1.5 bottom-1.5 flex size-7 items-center justify-center rounded-full bg-accent text-base leading-none text-on-accent opacity-0 shadow-lg transition-[opacity,transform] duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {added ? "×" : "+"}
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
        {categories.length >= 2 && (
          <p className="mt-1">
            <FlexTag categories={categories} compact />
          </p>
        )}
      </div>
    </motion.li>
  );
}

/** A titled gallery of cards to add. */
export function PickGrid({
  title,
  picks,
  owned,
  onAdd,
}: {
  title: string;
  picks: { card: CardDetails; categories?: Category[]; reason?: string }[];
  owned: (name: string) => number;
  onAdd: (card: CardDetails) => void;
}) {
  if (picks.length === 0) return null;
  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
        <AnimatePresence mode="popLayout" initial={false}>
          {picks.map((p, i) => (
            <BuildCard key={p.card.name} card={p.card} ownedCopies={owned(p.card.name)} categories={p.categories} reason={p.reason} index={i} flies={false} onAdd={onAdd} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
