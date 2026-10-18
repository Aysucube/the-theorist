"use client";

import { useState } from "react";
import { formatCount } from "@/lib/format";
import { tagKind, tagLabel, type Tag, type TagLinks } from "@/lib/deck-beta/synergy";
import type { PairingsState } from "@/lib/deck-beta/store";

const KIND_LABEL = { type: "Card type", subtype: "Subtype", theme: "Theme" } as const;
const KIND_STYLE = {
  type: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  subtype: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  theme: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300",
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

/** One tag and the deck cards behind it, folded after a few names. */
export function LinkRow({ link, onCard, fold = 6 }: { link: TagLinks; onCard?: (name: string) => void; fold?: number }) {
  const [open, setOpen] = useState(false);
  const shown = open ? link.cards : link.cards.slice(0, fold);
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <TagName tag={link.tag} />
        <span className="text-xs text-zinc-500 tabular-nums">
          {formatCount(link.cards.length)} {link.cards.length === 1 ? "card" : "cards"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {shown.map((name) => (
          <CardChip key={name} name={name} onClick={onCard && (() => onCard(name))} />
        ))}
        {link.cards.length > fold && (
          <button type="button" onClick={() => setOpen(!open)} className="px-1 text-xs text-amber-700 hover:underline dark:text-amber-400">
            {open ? "Show fewer" : `+${link.cards.length - fold} more`}
          </button>
        )}
      </div>
    </li>
  );
}

export function CardChip({ name, note, onClick }: { name: string; note?: string; onClick?: () => void }) {
  const className =
    "inline-flex max-w-full items-center gap-1 truncate rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900";
  const body = (
    <>
      <span className="truncate">{name}</span>
      {note && <span className="shrink-0 text-zinc-500 tabular-nums">{note}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} title={`Show ${name}'s synergies`} className={`${className} hover:border-amber-500`}>
      {body}
    </button>
  ) : (
    <span className={className}>{body}</span>
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
