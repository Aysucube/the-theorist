"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cardHref, formatCount, formatPercent, formatPhp } from "@/lib/format";
import { placeHoverCard } from "@/lib/hover-card";
import type { CardPreview } from "@/lib/types";
import { ColorIdentity, ManaCost } from "./mana";

/** How long the pointer must rest on a link before its preview loads. */
const HOVER_DELAY_MS = 350;
const CARD_SIZE = { width: 460, height: 360 };

// Previews already fetched this visit, so hovering a card again is instant.
const previews = new Map<string, Promise<CardPreview | null>>();

function loadPreview(name: string): Promise<CardPreview | null> {
  const cached = previews.get(name);
  if (cached) return cached;
  const request = fetch(`/api/preview?name=${encodeURIComponent(name)}`)
    .then((res) => (res.ok ? (res.json() as Promise<CardPreview>) : null))
    .catch(() => null);
  previews.set(name, request);
  // Don't remember failures: the next hover tries again.
  void request.then((preview) => preview ?? previews.delete(name));
  return request;
}

type PreviewState = CardPreview | "loading" | "error";

/**
 * A link to a card's page that shows a preview (artwork, colors, rules text,
 * cheapest PH price and shop, how decks use it, similar cards) while the
 * mouse rests on it or the link has keyboard focus.
 * Touch screens just follow the link.
 */
export function CardLink({ name, className, children }: { name: string; className?: string; children?: ReactNode }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [preview, setPreview] = useState<PreviewState>("loading");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();

  function show(anchor: { left: number; right: number; top: number; bottom: number }) {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setPreview("loading");
      setPosition(placeHoverCard(anchor, { width: window.innerWidth, height: window.innerHeight }, CARD_SIZE));
      setPreview((await loadPreview(name)) ?? "error");
    }, HOVER_DELAY_MS);
  }

  function hide() {
    clearTimeout(timer.current);
    setPosition(null);
  }

  // A fixed-position card would drift away from its link on scroll; close it instead.
  useEffect(() => {
    if (!position) return;
    const close = () => {
      clearTimeout(timer.current);
      setPosition(null);
    };
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [position]);

  useEffect(() => () => clearTimeout(timer.current), []);

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
      {position && createPortal(<HoverCard id={id} name={name} preview={preview} position={position} />, document.body)}
    </>
  );
}

function HoverCard({
  id,
  name,
  preview,
  position,
}: {
  id: string;
  name: string;
  preview: PreviewState;
  position: { left: number; top: number };
}) {
  const loaded = typeof preview === "object" ? preview : null;
  const cheapest = loaded?.cheapest;
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(position.top);

  // The card's height depends on its rules text; nudge it up if it runs off the bottom.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    setTop(Math.max(12, Math.min(position.top, window.innerHeight - height - 12)));
  }, [position.top, preview]);

  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={{ left: position.left, top, width: CARD_SIZE.width, maxWidth: "calc(100vw - 24px)" }}
      className="pointer-events-none fixed z-50 grid grid-cols-[150px_1fr] gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="aspect-[488/680] self-start overflow-hidden rounded-[4.75%] bg-zinc-200 dark:bg-zinc-800">
        {loaded?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={loaded.imageUrl} alt="" width={488} height={680} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 text-xs">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-tight font-semibold">{loaded?.name ?? name}</p>
          {loaded?.manaCost && <ManaCost cost={loaded.manaCost} />}
        </div>

        {preview === "loading" && <p className="text-zinc-500">Loading card details…</p>}
        {preview === "error" && <p className="text-zinc-500">Couldn’t load this card right now.</p>}

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
