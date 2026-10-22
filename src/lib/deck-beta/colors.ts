// The five colors of Magic as screen colors, for glows and the commander's star.
// Black is drawn as a violet-gray so it still shows up on a dark background.
export const MANA_HEX: Record<string, string> = {
  W: "#f5ecc9",
  U: "#3b82f6",
  B: "#8b7aa8",
  R: "#ef4444",
  G: "#22c55e",
  C: "#a1a1aa",
};

/** The commander's colors in WUBRG order as screen colors; gray for colorless. */
export function manaHexes(colors: string[]): string[] {
  const own = [..."WUBRG"].filter((c) => colors.includes(c)).map((c) => MANA_HEX[c]);
  return own.length > 0 ? own : [MANA_HEX.C];
}
