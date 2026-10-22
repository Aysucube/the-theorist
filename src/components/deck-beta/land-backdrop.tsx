"use client";

import Image from "next/image";
import { useLandArt } from "@/lib/deck-beta/store";

/**
 * A land in the commander's colors behind a network, dimmed so the network
 * reads on top: Savannah for a green-white deck, a basic for one color. Its
 * artist is credited in the corner.
 */
export function LandBackdrop({ colors, seed }: { colors: string[]; seed: string }) {
  const art = useLandArt(colors, seed);
  if (!art?.found) return null;
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <Image
          key={art.artUrl}
          src={art.artUrl}
          alt=""
          fill
          unoptimized
          sizes="100vw"
          className="scale-105 object-cover blur-[1px] brightness-[0.38] saturate-[0.8]"
        />
        <div className="absolute inset-0 bg-radial from-zinc-950/10 via-zinc-950/45 to-zinc-950/85" />
      </div>
      <p className="pointer-events-none absolute bottom-1.5 left-2.5 text-[10px] text-zinc-400/80">
        {art.name}
        {art.artist && ` · art by ${art.artist}`}
      </p>
    </>
  );
}
