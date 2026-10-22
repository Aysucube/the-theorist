"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cardHref, formatCount, formatPercent, formatPhp } from "@/lib/format";
import { placeHoverCard } from "@/lib/hover-card";
import { fetchJsonWithRetry, RETRY_WAITS_MS, sleep } from "@/lib/retry";
import type { CardPreview } from "@/lib/types";
import { GameChangerTag } from "./game-changer-tag";
import { ColorIdentity, ManaCost } from "./mana";
import { ImageNote, RetryingImage } from "./retrying-image";

/** How long the pointer must rest on a link before its preview loads. */
const HOVER_DELAY_MS = 350;
// A roomy window: a 300px card image you can read, and details in normal-size text.
const CARD_SIZE = { width: 720, height: 480 };

/** What a hover card knows about a card's preview so far. */
interface Snapshot {
  preview?: CardPreview;
  /** Set while waiting before another try. */
  waiting?: { seconds: number; reason: string };
  done: boolean;
}

interface Tracker {
  snapshot: Snapshot;
  listeners: Set<(snapshot: Snapshot) => void>;
}

// One tracker per card for this visit. It keeps retrying after the hover card
// closes, so the next hover shows the finished preview at once.
const trackers = new Map<string, Tracker>();

function update(tracker: Tracker, patch: Partial<Snapshot>) {
  tracker.snapshot = { ...tracker.snapshot, ...patch };
  tracker.listeners.forEach((listener) => listener(tracker.snapshot));
}

async function track(name: string, tracker: Tracker) {
  const url = `/api/preview?name=${encodeURIComponent(name)}`;
  const onWait = (ms: number, reason: string) =>
    update(tracker, { waiting: { seconds: Math.round(ms / 1000), reason } });

  for (let attempt = 0; ; attempt++) {
    const result = await fetchJsonWithRetry<CardPreview>(url, { onWait, busyReason: "a card source is busy" });
    if (result === "error") break;
    update(tracker, { preview: result, waiting: undefined });
    // A source failed this time (e.g. Scryfall's pause): ask again for the missing parts.
    if (!result.incomplete || attempt >= RETRY_WAITS_MS.length) break;
    onWait(RETRY_WAITS_MS[attempt], "some details are still loading");
    await sleep(RETRY_WAITS_MS[attempt]);
  }
  update(tracker, { waiting: undefined, done: true });
  // Nothing at all came back: forget it so a later hover starts over.
  if (!tracker.snapshot.preview) trackers.delete(name);
}

/** Calls `listener` now and on every change to this card's preview. Returns an unsubscribe function. */
function watchPreview(name: string, listener: (snapshot: Snapshot) => void): () => void {
  let tracker = trackers.get(name);
  if (!tracker) {
    tracker = { snapshot: { done: false }, listeners: new Set() };
    trackers.set(name, tracker);
    void track(name, tracker);
  }
  const t = tracker;
  t.listeners.add(listener);
  listener(t.snapshot);
  return () => t.listeners.delete(listener);
}

/** Props to spread on whatever element shows a card's hover preview. */
export interface HoverTriggerProps {
  "aria-describedby"?: string;
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
  /** Closes the preview; call it from your own click handler too. */
  onClick: () => void;
}

/** Where a hover preview is anchored: the pointer, or the focused element's box. */
export interface HoverAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The hover card itself, for whichever card `show` was last given. */
function useHoverCard() {
  // The card, where its preview shows, and the element it's rendered into:
  // inside a modal dialog (the deck beta's synergy map) it must live in the
  // dialog, since modal dialogs sit above everything else on the page.
  const [position, setPosition] = useState<{ name: string; left: number; top: number; container: Element } | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ done: false });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unwatch = useRef<(() => void) | undefined>(undefined);
  const id = useId();

  function show(name: string, element: Element, anchor: HoverAnchor) {
    clearTimeout(timer.current);
    const container = element.closest("dialog") ?? document.body;
    timer.current = setTimeout(() => {
      const place = placeHoverCard(anchor, { width: window.innerWidth, height: window.innerHeight }, CARD_SIZE);
      setPosition({ name, ...place, container });
      unwatch.current?.();
      unwatch.current = watchPreview(name, setSnapshot);
    }, HOVER_DELAY_MS);
  }

  function hide() {
    clearTimeout(timer.current);
    // Stop listening; the tracker keeps loading in the background.
    unwatch.current?.();
    unwatch.current = undefined;
    setPosition(null);
  }

  // A fixed-position card would drift away from its element on scroll; close it instead.
  useEffect(() => {
    if (!position) return;
    const close = () => {
      clearTimeout(timer.current);
      unwatch.current?.();
      unwatch.current = undefined;
      setPosition(null);
    };
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [position]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      unwatch.current?.();
    },
    [],
  );

  return {
    id,
    open: position !== null,
    show,
    hide,
    preview: position
      ? createPortal(<HoverCard id={id} name={position.name} snapshot={snapshot} position={position} />, position.container)
      : null,
  };
}

/**
 * A card's hover preview (artwork, colors, rules text, cheapest PH price and
 * shop, how decks use it, similar cards), shown while the mouse rests on an
 * element or it has keyboard focus. Spread `trigger` on the element and render
 * `preview` next to it. Busy sources and slow images are waited out and
 * retried, so the preview fills in completely. Touch screens don't get one.
 */
export function useHoverPreview(name: string): { trigger: HoverTriggerProps; preview: ReactNode } {
  const card = useHoverCard();
  return {
    trigger: {
      "aria-describedby": card.open ? card.id : undefined,
      onPointerEnter: (e) => {
        if (e.pointerType !== "mouse") return;
        card.show(name, e.currentTarget, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
      },
      onPointerLeave: card.hide,
      onFocus: (e) => card.show(name, e.currentTarget, e.currentTarget.getBoundingClientRect()),
      onBlur: card.hide,
      onClick: card.hide,
    },
    preview: card.preview,
  };
}

/**
 * One hover preview shared by many cards drawn together, such as a network's
 * nodes: call `show` with the card under the pointer and `hide` when it leaves.
 */
export function useCardHover(): { show: (name: string, element: Element, anchor: HoverAnchor) => void; hide: () => void; preview: ReactNode } {
  const { show, hide, preview } = useHoverCard();
  return { show, hide, preview };
}

/** A link to a card's page that shows the card's hover preview, and a "Game Changer" label after it when it is one. */
export function CardLink({
  name,
  className,
  children,
  tag = true,
}: {
  name: string;
  className?: string;
  children?: ReactNode;
  /** false leaves the Game Changer label to the caller (e.g. over a tile's artwork). */
  tag?: boolean;
}) {
  const { trigger, preview } = useHoverPreview(name);
  return (
    <>
      <Link
        href={cardHref(name)}
        // No prefetch: lists can hold 100+ of these links.
        prefetch={false}
        className={className}
        {...trigger}
      >
        {children ?? name}
      </Link>
      {tag && <GameChangerTag name={name} className="ml-1.5" />}
      {preview}
    </>
  );
}

function HoverCard({
  id,
  name,
  snapshot,
  position,
}: {
  id: string;
  name: string;
  snapshot: Snapshot;
  position: { left: number; top: number };
}) {
  const loaded = snapshot.preview;
  const waiting = snapshot.waiting;
  const cheapest = loaded?.cheapest;
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(position.top);

  // The card's height depends on its rules text; nudge it up if it runs off the bottom.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    setTop(Math.max(12, Math.min(position.top, window.innerHeight - height - 12)));
  }, [position.top, snapshot]);

  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={{ left: position.left, top, width: CARD_SIZE.width, maxWidth: "calc(100vw - 24px)" }}
      className="pointer-events-none fixed z-50 grid grid-cols-[300px_1fr] gap-4 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="aspect-[488/680] self-start overflow-hidden rounded-[4.75%] bg-zinc-200 dark:bg-zinc-800">
        {loaded?.imageUrl ? (
          // A new key starts a fresh load if the preview's image changes.
          <RetryingImage key={loaded.imageUrl} url={loaded.imageUrl} failedText="Image couldn’t load. Hover again to retry." />
        ) : snapshot.done ? (
          <ImageNote text="No image available" />
        ) : (
          <ImageNote text="Loading image…" spinner />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2 text-sm leading-relaxed">
        <div className="flex items-start justify-between gap-2">
          <p className="text-lg leading-tight font-semibold">
            {loaded?.name ?? name}
            <GameChangerTag name={loaded?.name ?? name} className="ml-2" />
          </p>
          {loaded?.manaCost && <ManaCost cost={loaded.manaCost} />}
        </div>

        {waiting && (
          <p className="text-amber-700 dark:text-amber-400">
            Waiting {waiting.seconds}s because {waiting.reason}, then trying again…
          </p>
        )}
        {!loaded && !waiting && !snapshot.done && <p className="text-zinc-500">Loading card details…</p>}
        {!loaded && snapshot.done && <p className="text-zinc-500">Couldn’t load this card after several tries.</p>}

        {loaded && (
          <>
            {loaded.typeLine && <p className="text-zinc-500">{loaded.typeLine}</p>}
            {loaded.colorIdentity && (
              <p className="text-zinc-600 dark:text-zinc-300">
                <ColorIdentity colors={loaded.colorIdentity} />
              </p>
            )}
            {loaded.oracleText && <p className="line-clamp-12 whitespace-pre-line">{loaded.oracleText}</p>}

            <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
              {cheapest ? (
                <>
                  <p>
                    <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                      {formatPhp(cheapest.pricePhp)}
                    </span>{" "}
                    at <span className="font-semibold">{cheapest.store}</span>
                    {loaded.stores > 1 && <span className="text-zinc-500"> · {formatCount(loaded.stores)} stores</span>}
                  </p>
                  <p className="text-zinc-500">
                    {[cheapest.printing, cheapest.conditionLabel ?? cheapest.condition].filter(Boolean).join(" · ")}
                  </p>
                </>
              ) : (
                <p className="text-zinc-500">
                  {loaded.priceUnavailable ? "PH prices unavailable right now." : "Not in PH stores right now."}
                </p>
              )}
            </div>

            {loaded.decks && (
              <p>
                <span className="font-medium">Decks:</span> in {formatPercent(loaded.decks.inclusion)} of decks that
                can run it ({formatCount(loaded.decks.numDecks)} decks)
                {loaded.decks.topCommanders.length > 0 && (
                  <span className="text-zinc-500"> · popular with {loaded.decks.topCommanders.join(", ")}</span>
                )}
              </p>
            )}
            {loaded.similar && loaded.similar.length > 0 && (
              <p className="line-clamp-2">
                <span className="font-medium">Similar:</span> {loaded.similar.join(", ")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
