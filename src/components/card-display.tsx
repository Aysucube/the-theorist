"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { showPrinting, useShownPrinting } from "@/lib/shown-printing";

/**
 * The big card image at the top of a card page. Shows whichever printing was
 * clicked in the Printings section (scrolling up to it), with a way back.
 */
export function CardImage({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const { printing, clicks } = useShownPrinting(name);
  const ref = useRef<HTMLDivElement>(null);
  const seenClicks = useRef(clicks);

  // Scroll up to the image after a click below, but not when the page first opens.
  useEffect(() => {
    if (clicks !== seenClicks.current) {
      seenClicks.current = clicks;
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [clicks]);

  const src = printing?.imageUrl ?? imageUrl;
  return (
    <div ref={ref} className="mx-auto w-full max-w-[240px] scroll-mt-6">
      {src ? (
        <Image
          key={src}
          src={src}
          alt={printing ? `${name}, ${printing.label}` : name}
          width={488}
          height={680}
          priority
          // Scryfall's CDN already serves sized images and rejects the optimizer's requests.
          unoptimized
          className="h-auto w-full rounded-[4.75%] shadow-lg shadow-black/50"
        />
      ) : (
        <div className="flex aspect-[488/680] items-center justify-center rounded-xl bg-subtle text-sm text-muted">
          No image
        </div>
      )}
      {printing && (
        <p className="mt-2 text-center text-xs text-foreground/80 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
          Showing {printing.label}.{" "}
          <button type="button" onClick={() => showPrinting(name, null)} className="link">
            Show default
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * The card's artwork behind the whole page, in grayscale, darkened and washed
 * in midnight blue (like a memory Jace is reading) so the text on top stays
 * readable. Follows the
 * printing chosen in the Printings section when it has its own artwork.
 */
export function ArtBackground({ name, artUrl }: { name: string; artUrl?: string }) {
  const { printing } = useShownPrinting(name);
  const url = printing?.artUrl ?? artUrl;
  if (!url) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <Image key={url} src={url} alt="" fill unoptimized sizes="100vw" className="object-cover object-top brightness-[0.5] grayscale" />
      <div className="absolute inset-0 bg-[#1d4f9e]/40 mix-blend-color" />
      <div className="absolute inset-0 bg-linear-to-b from-background/10 via-background/50 to-background" />
    </div>
  );
}
