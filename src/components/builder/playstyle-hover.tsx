"use client";

import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BALANCED_GUIDE, closersIn, playstyleGuide } from "@/lib/deck-beta/playstyle-guide";
import { usePlaystyle } from "@/lib/deck-beta/store";
import { placeHoverCard } from "@/lib/hover-card";
import type { CardDetails } from "@/lib/types";

/** How long the pointer must rest on a playstyle before it opens, as for a card's preview. */
const HOVER_DELAY_MS = 350;
const CARD_SIZE = { width: 360, height: 320 };
/** Cards read for a playstyle's closers: its top ones, in one Scryfall request. */
const LOOK_CARDS = 60;

/** Who the playstyle is for, to read its decks. */
export interface PlaystyleContext {
  commander?: CardDetails;
  colors: string[];
}

/**
 * A playstyle's hover card, shown like a card's preview while the mouse rests
 * on it or it has keyboard focus: what the deck does and how it wins. Spread
 * `trigger` on the element and render `preview` next to it. Without a slug,
 * it's the balanced deck.
 */
export function usePlaystyleHover(playstyle: { slug?: string; name: string }, context: PlaystyleContext) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = (element: Element) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPosition(placeHoverCard(element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, CARD_SIZE));
    }, HOVER_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setPosition(null);
  };

  // A fixed-position card would drift away from its row on scroll; close it instead.
  useEffect(() => {
    if (!position) return;
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, [position]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const trigger = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") show(e.currentTarget);
    },
    onPointerLeave: hide,
    onFocus: (e: FocusEvent<HTMLElement>) => show(e.currentTarget),
    onBlur: hide,
  };
  const preview: ReactNode = position ? createPortal(<PlaystyleCard playstyle={playstyle} context={context} position={position} />, document.body) : null;
  return { trigger, preview };
}

function PlaystyleCard({ playstyle, context, position }: { playstyle: { slug?: string; name: string }; context: PlaystyleContext; position: { left: number; top: number } }) {
  const { slug, name } = playstyle;
  const guide = slug ? playstyleGuide(slug, name) : BALANCED_GUIDE;
  const state = usePlaystyle(slug ? context.commander : undefined, slug, context.colors, LOOK_CARDS);
  const found = state?.state === "done" && state.result.found ? state.result : undefined;
  const closers = found ? closersIn(found.cards, found.details) : [];
  return (
    <div
      role="tooltip"
      style={{ left: position.left, top: position.top, width: CARD_SIZE.width, maxWidth: "calc(100vw - 24px)" }}
      className="pop-in pointer-events-none fixed z-50 flex flex-col gap-3 rounded-xl border border-line-strong bg-surface p-4 text-sm leading-relaxed text-foreground shadow-[0_24px_60px_-16px_rgb(0_0_0/0.75),0_0_40px_-16px_rgb(90_176_255/0.3)] [--transform-origin:left_top]"
    >
      <div>
        <p className="text-lg leading-tight font-semibold">{name}</p>
        <p className="mt-1 text-muted">{guide.about}</p>
      </div>
      <div>
        <p className="eyebrow">How it wins</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {guide.wins.map((win) => (
            <li key={win} className="flex gap-2">
              <span aria-hidden className="text-accent">
                •
              </span>
              {win}
            </li>
          ))}
        </ul>
      </div>
      {slug && (state?.state === "loading" || state?.state === "waiting" || closers.length > 0) && (
        <div>
          <p className="eyebrow">Finishers in these decks</p>
          {closers.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {closers.map((closer) => (
                <li key={closer.name} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{closer.name}</span>
                  <span className="shrink-0 text-xs text-muted">{closer.how}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span aria-hidden className="spinner size-3" /> Reading these decks…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
