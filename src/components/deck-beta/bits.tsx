"use client";

import { formatCount } from "@/lib/format";
import { tagKind, tagLabel, type Tag, type TagLinks } from "@/lib/deck-beta/synergy";
import type { PairingsState } from "@/lib/deck-beta/store";
import type { CardDetails } from "@/lib/types";
import { useHoverPreview } from "../card-link";
import { GameChangerTag } from "../game-changer-tag";
import { LazyCardImage } from "./lazy-card-image";

const KIND_LABEL = { type: "Card type", subtype: "Subtype", theme: "Theme" } as const;
const KIND_STYLE = {
  type: "bg-subtle text-foreground/80  ",
  subtype: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  theme: "bg-subtle text-muted ",
} as const;

/** A tag's name, colored by kind: card type (gray), subtype (blue) or EDHREC-style theme (violet). */
export function TagName({ tag }: { tag: Tag }) {
  const kind = tagKind(tag);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLE[kind]}`} title={KIND_LABEL[kind]}>
      {tagLabel(tag)}
    </span>
  );
}

/** A card's name that shows its hover preview while the mouse rests on it (or it has keyboard focus). */
export function HoverName({ name, className }: { name: string; className?: string }) {
  const { trigger, preview } = useHoverPreview(name);
  return (
    <>
      <span {...trigger} tabIndex={0} className={className}>
        {name}
      </span>
      {preview}
    </>
  );
}

/** Finds a deck card's details by name, for its artwork. */
export type CardLookup = (name: string) => CardDetails | undefined;

/** One tag and the deck cards behind it, as a scrollable gallery. */
export function LinkRow({
  link,
  cardFor,
  onCard,
  hoverPreview,
}: {
  link: TagLinks;
  cardFor: CardLookup;
  onCard?: (name: string) => void;
  hoverPreview?: boolean;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <TagName tag={link.tag} />
        <span className="text-xs text-muted tabular-nums">
          {formatCount(link.cards.length)} {link.cards.length === 1 ? "card" : "cards"}
        </span>
      </div>
      <MiniGallery
        label={tagLabel(link.tag)}
        items={link.cards.map((name) => ({ name }))}
        cardFor={cardFor}
        onCard={onCard}
        hoverPreview={hoverPreview}
      />
    </li>
  );
}

/**
 * A small gallery of cards (artwork and name) in a box that scrolls once it
 * holds more than about two rows. Images load as they scroll into view.
 * With `hoverPreview`, resting the mouse on a card shows its hover preview.
 */
export function MiniGallery({
  label,
  items,
  cardFor,
  onCard,
  hoverPreview,
}: {
  label: string;
  /** `note` goes under the name, e.g. EDHREC's "×3.2". */
  items: { name: string; note?: string }[];
  cardFor: CardLookup;
  onCard?: (name: string) => void;
  hoverPreview?: boolean;
}) {
  return (
    <ul
      aria-label={label}
      className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(76px,1fr))] content-start gap-2 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-2"
    >
      {items.map((item) => (
        <GalleryItem key={item.name} {...item} imageUrl={cardFor(item.name)?.imageUrl} onCard={onCard} hoverPreview={hoverPreview} />
      ))}
    </ul>
  );
}

function GalleryItem({
  name,
  note,
  imageUrl,
  onCard,
  hoverPreview,
}: {
  name: string;
  note?: string;
  imageUrl?: string;
  onCard?: (name: string) => void;
  hoverPreview?: boolean;
}) {
  const hover = useHoverPreview(name);
  const trigger = hoverPreview ? hover.trigger : undefined;
  const body = (
    <>
      <div className="relative aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle transition-opacity group-hover:opacity-85">
        <LazyCardImage url={imageUrl} alt={name} />
        <GameChangerTag name={name} compact className="absolute top-1 left-1 shadow" />
      </div>
      <p className="mt-1 truncate text-[11px] leading-tight font-medium group-hover:underline">{name}</p>
      {note && <p className="text-[11px] leading-tight text-muted tabular-nums">{note}</p>}
    </>
  );
  return (
    <li className="min-w-0">
      {onCard ? (
        <button
          type="button"
          {...trigger}
          onClick={() => {
            trigger?.onClick();
            onCard(name);
          }}
          // The hover preview already names the card; a native tooltip would cover it.
          title={trigger ? undefined : `Show ${name}’s synergies`}
          aria-label={`Show ${name}’s synergies`}
          className="group block w-full text-left"
        >
          {body}
        </button>
      ) : (
        <div {...trigger} title={trigger ? undefined : name}>
          {body}
        </div>
      )}
      {hoverPreview && hover.preview}
    </li>
  );
}

/** What's happening with a card's EDHREC lookup, in words; null once it's done. */
export function pairingsMessage(state: PairingsState | undefined): string | null {
  if (!state || state.state === "loading") return "Loading EDHREC data…";
  if (state.state === "waiting") return `Waiting ${state.seconds}s because ${state.reason}, then trying again…`;
  if (state.state === "error") return "Couldn’t reach EDHREC after several tries.";
  return null;
}

/** "×3.2": how many times more often EDHREC sees two cards together than apart. */
export const formatLift = (lift: number) => `×${lift >= 10 ? Math.round(lift) : lift.toFixed(1)}`;
