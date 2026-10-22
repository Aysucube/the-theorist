"use client";

import { useGameChangers } from "@/lib/use-game-changers";

const WHY = "On the Commander Game Changers list: Brackets 1 and 2 allow none, Bracket 3 up to three.";

/** A small "Game Changer" label, shown only when the card is on the list. `compact` says "GC". */
export function GameChangerTag({ name, compact = false, className = "" }: { name: string; compact?: boolean; className?: string }) {
  const { has } = useGameChangers();
  if (!has(name)) return null;
  return (
    <span
      title={WHY}
      className={`inline-flex shrink-0 items-center rounded bg-rose-600 px-1 align-middle text-[10px] leading-4 font-semibold tracking-wide whitespace-nowrap text-white uppercase ${className}`}
    >
      {compact ? "GC" : "Game Changer"}
    </span>
  );
}
