"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cardHref, formatCount, formatPercent, formatPhp } from "@/lib/format";
import { placeHoverCard } from "@/lib/hover-card";
import { getImageStatus, subscribeImage } from "@/lib/image-loader";
import { fetchJsonWithRetry, RETRY_WAITS_MS, sleep } from "@/lib/retry";
import type { CardPreview } from "@/lib/types";
import { ColorIdentity, ManaCost } from "./mana";

/** How long the pointer must rest on a link before its preview loads. */
const HOVER_DELAY_MS = 350;
const CARD_SIZE = { width: 460, height: 360 };

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

/**
 * A link to a card's page that shows a preview (artwork, colors, rules text,
 * cheapest PH price and shop, how decks use it, similar cards) while the
 * mouse rests on it or the link has keyboard focus. Busy sources and slow
 * images are waited out and retried, so the preview fills in completely.
 * Touch screens just follow the link.
 */
export function CardLink({ name, className, children }: { name: string; className?: string; children?: ReactNode }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ done: false });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unwatch = useRef<(() => void) | undefined>(undefined);
  const id = useId();

  function show(anchor: { left: number; right: number; top: number; bottom: number }) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPosition(placeHoverCard(anchor, { width: window.innerWidth, height: window.innerHeight }, CARD_SIZE));
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

  // A fixed-position card would drift away from its link on scroll; close it instead.
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

  return (
    <>
      <Link
        href={cardHref(name)}
        // No prefetch: lists can hold 100+ of these links.
        prefetch={false}
        className={className}
        aria-describedby={position ? id : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          show({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
        }}
        onPointerLeave={hide}
        onFocus={(e) => show(e.currentTarget.getBoundingClientRect())}
        onBlur={hide}
        onClick={hide}
      >
        {children ?? name}
      </Link>
      {position && createPortal(<HoverCard id={id} name={name} snapshot={snapshot} position={position} />, document.body)}
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
      className="pointer-events-none fixed z-50 grid grid-cols-[150px_1fr] gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="aspect-[488/680] self-start overflow-hidden rounded-[4.75%] bg-zinc-200 dark:bg-zinc-800">
        {loaded?.imageUrl ? (
          // A new key starts a fresh load if the preview's image changes.
          <CardImage key={loaded.imageUrl} url={loaded.imageUrl} />
        ) : snapshot.done ? (
          <ImageNote text="No image available" />
        ) : (
          <ImageNote text="Loading image…" spinner />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 text-xs">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-tight font-semibold">{loaded?.name ?? name}</p>
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
            {loaded.oracleText && <p className="line-clamp-6 whitespace-pre-line">{loaded.oracleText}</p>}

            <div className="border-t border-zinc-200 pt-1.5 dark:border-zinc-700">
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

/** The card's artwork, with a spinner and retry status until it has really loaded. */
function CardImage({ url }: { url: string }) {
  // Shared with every hover card showing this image; the download outlives this one.
  const subscribe = useCallback((notify: () => void) => subscribeImage(url, notify), [url]);
  const state = useSyncExternalStore(
    subscribe,
    () => getImageStatus(url),
    () => getImageStatus(url),
  );

  if (state.src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={state.src} alt="" width={488} height={680} className="h-full w-full object-cover" />;
  }
  if (state.failed) return <ImageNote text="Image couldn’t load. Hover again to retry." />;
  if (state.retryIn !== undefined) {
    return <ImageNote text={`Image is slow; retrying in ${state.retryIn}s (try ${(state.attempt ?? 0) + 1})…`} spinner />;
  }
  return <ImageNote text="Loading image…" spinner />;
}

function ImageNote({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-[11px] text-zinc-500">
      {spinner && (
        <span
          aria-hidden
          className="size-5 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500 dark:border-zinc-600 dark:border-t-amber-400"
        />
      )}
      {text}
    </div>
  );
}
