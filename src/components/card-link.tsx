"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cardHref, formatCount, formatPhp } from "@/lib/format";
import { placeHoverCard } from "@/lib/hover-card";
import type { CardPreview } from "@/lib/types";

/** How long the pointer must rest on a link before its preview loads. */
const HOVER_DELAY_MS = 350;
const CARD_SIZE = { width: 224, height: 420 };

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
 * A link to a card's page that shows a small preview (artwork, cheapest PH
 * price and shop) while the mouse rests on it or the link has keyboard focus.
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

  return (
    <div
      id={id}
      role="tooltip"
      style={{ left: position.left, top: position.top, width: CARD_SIZE.width }}
      className="pointer-events-none fixed z-50 rounded-xl border border-zinc-200 bg-white p-2 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="aspect-[488/680] overflow-hidden rounded-[4.75%] bg-zinc-200 dark:bg-zinc-800">
        {loaded?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={loaded.imageUrl} alt="" width={488} height={680} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="mt-2 px-1 pb-1 text-sm">
        <p className="leading-tight font-medium">{loaded?.name ?? name}</p>
        {preview === "loading" && <p className="mt-1 text-zinc-500">Checking PH prices…</p>}
        {preview === "error" && <p className="mt-1 text-zinc-500">Couldn’t load the price right now.</p>}
        {loaded && !cheapest && <p className="mt-1 text-zinc-500">Not in PH stores right now.</p>}
        {cheapest && (
          <>
            <p className="mt-1">
              <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                {formatPhp(cheapest.pricePhp)}
              </span>{" "}
              at <span className="font-semibold">{cheapest.store}</span>
            </p>
            <p className="text-xs text-zinc-500">
              {[cheapest.printing, cheapest.conditionLabel ?? cheapest.condition].filter(Boolean).join(" · ")}
              {loaded.stores > 1 && ` · ${formatCount(loaded.stores)} stores have it`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
