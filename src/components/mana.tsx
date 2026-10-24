// Small colored "pips" for mana costs ({2}{U}{B}) and color identity.

const COLORS: Record<string, { name: string; className: string }> = {
  W: { name: "White", className: "bg-[#f8f1c8] text-zinc-900" },
  U: { name: "Blue", className: "bg-[#a9d8f2] text-zinc-900" },
  B: { name: "Black", className: "bg-[#c9bfbb] text-zinc-900" },
  R: { name: "Red", className: "bg-[#f4a98f] text-zinc-900" },
  G: { name: "Green", className: "bg-[#9ccfac] text-zinc-900" },
};
const GENERIC = "bg-zinc-300 text-zinc-900";

/** Splits "{2}{U/B}{G}" into ["2", "U/B", "G"]. */
export function manaSymbols(cost: string): string[] {
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

/** One mana symbol as a colored pip. */
export function Pip({ symbol, className = "" }: { symbol: string; className?: string }) {
  // Hybrid and Phyrexian symbols ("W/U", "B/P") take the first color they mention.
  const color = symbol.split("/").map((part) => COLORS[part]).find(Boolean);
  return (
    <span
      className={`inline-flex size-4 items-center justify-center rounded-full text-[9px] leading-none font-bold ${className} ${
        color?.className ?? GENERIC
      }`}
    >
      {symbol.length <= 2 ? symbol : symbol.replace("/", "")}
    </span>
  );
}

export function ManaCost({ cost }: { cost: string }) {
  const symbols = manaSymbols(cost);
  if (symbols.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 gap-0.5" aria-label={`Mana cost ${symbols.join(" ")}`}>
      {symbols.map((s, i) => (
        <Pip key={i} symbol={s} />
      ))}
    </span>
  );
}

/** "Blue, Black" with matching pips, or "Colorless". `compact` shows just the pips (the names stay for screen readers). */
export function ColorIdentity({ colors, compact = false }: { colors: string[]; compact?: boolean }) {
  const known = colors.filter((c) => COLORS[c]);
  if (known.length === 0) return compact ? <span className="text-[11px] text-muted">Colorless</span> : <span>Colorless</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${compact ? "shrink-0" : "flex-wrap"}`}>
      {known.map((c) => (
        <Pip key={c} symbol={c} />
      ))}
      <span className={compact ? "sr-only" : undefined}>{known.map((c) => COLORS[c].name).join(", ")}</span>
    </span>
  );
}
