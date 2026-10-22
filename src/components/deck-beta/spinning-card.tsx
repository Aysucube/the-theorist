import { manaHexes } from "@/lib/deck-beta/colors";

/**
 * A card turning slowly on its own axis, seen from a little above with no
 * perspective (an axonometric view), with a glow in its colors underneath.
 * Its back is a swirl of the same colors. Sized by its parent's width.
 */
export function SpinningCard({ imageUrl, colors }: { imageUrl: string; colors: string[] }) {
  const hex = manaHexes(colors);
  const swirl = `conic-gradient(from 30deg, ${[...hex, hex[0]].join(", ")})`;
  return (
    <div aria-hidden className="relative w-full">
      <div
        className="absolute inset-[-35%] rounded-full opacity-60 blur-xl"
        style={{ background: `radial-gradient(circle, ${hex.map((h, i) => `${h} ${Math.round((i / hex.length) * 45)}%`).join(", ")}, transparent 70%)` }}
      />
      <div className="spin-card">
        <div className="spin-face shadow-[0_0_18px_rgb(0_0_0/0.6)]" style={{ backgroundImage: `url("${imageUrl}")` }} />
        <div className="spin-face spin-back flex items-center justify-center" style={{ background: swirl }}>
          <div className="aspect-square w-1/2 rounded-full border-2 border-white/60 bg-zinc-950/40 shadow-[inset_0_0_12px_rgb(0_0_0/0.6)]" />
        </div>
      </div>
    </div>
  );
}
