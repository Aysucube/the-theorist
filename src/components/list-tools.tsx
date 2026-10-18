"use client";

import { useState } from "react";
import { formatCount } from "@/lib/format";
import { checkPrices, usePriceQueue } from "@/lib/price-queue";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { CardInfo } from "@/lib/types";
import { CardTile } from "./card-tile";
import { PriceCheck } from "./price-check";

type Gallery =
  | { status: "loading"; waiting?: { seconds: number; reason: string } }
  | { status: "ready"; cards: Record<string, CardInfo> }
  | { status: "error" };

const button =
  "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:border-amber-500 disabled:cursor-default disabled:opacity-60 dark:border-zinc-700";

/**
 * "Load All Prices" and "Load Gallery" for one EDHREC list. Prices go through
 * the shared queue (one card at a time, retried if busy), so the rows above
 * fill in too. The gallery's artwork comes from one bulk Scryfall lookup.
 */
export function ListTools({ names }: { names: string[] }) {
  const priceOf = usePriceQueue();
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  const done = names.filter((n) => {
    const s = priceOf(n);
    return s.status === "done" && s.result !== "error";
  }).length;
  const pending = names.filter((n) => ["queued", "loading", "waiting"].includes(priceOf(n).status)).length;

  async function loadGallery() {
    setShowGallery(true);
    if (gallery?.status === "ready" || gallery?.status === "loading") return;
    setGallery({ status: "loading" });
    const result = await fetchJsonWithRetry<{ cards: Record<string, CardInfo> }>("/api/cards/info", {
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names }) },
      onWait: (ms, reason) => setGallery({ status: "loading", waiting: { seconds: Math.round(ms / 1000), reason } }),
      busyReason: "Scryfall is busy",
    });
    setGallery(result === "error" ? { status: "error" } : { status: "ready", cards: result.cards });
  }

  return (
    <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => checkPrices(names)} disabled={done === names.length} className={button}>
          Load All Prices
        </button>
        <button
          type="button"
          onClick={() => (showGallery ? setShowGallery(false) : void loadGallery())}
          className={button}
        >
          {showGallery ? "Hide Gallery" : "Load Gallery"}
        </button>
        <span role="status" className="text-xs text-zinc-500 tabular-nums">
          {pending > 0
            ? `Loading prices… ${formatCount(done)} of ${formatCount(names.length)}`
            : done > 0
              ? `${formatCount(done)} of ${formatCount(names.length)} prices loaded`
              : ""}
        </span>
      </div>

      {showGallery && gallery && (
        <div className="mt-3">
          {gallery.status === "loading" && (
            <p className="text-xs text-zinc-500">
              {gallery.waiting
                ? `Waiting ${gallery.waiting.seconds}s because ${gallery.waiting.reason}, then trying again…`
                : "Loading gallery…"}
            </p>
          )}
          {gallery.status === "error" && (
            <p className="text-xs text-zinc-500">
              Couldn’t load the gallery after several tries.{" "}
              <button type="button" onClick={() => { setGallery(null); void loadGallery(); }} className="underline">
                Try again
              </button>
            </p>
          )}
          {gallery.status === "ready" && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {names.map((name) => (
                <li key={name}>
                  <CardTile name={name} imageUrl={gallery.cards[name]?.imageUrl}>
                    <PriceCheck name={name} />
                  </CardTile>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
