// Deck Synergy: the land whose artwork sits behind the network, in the
// commander's colors: a basic land for one color, the original dual land for
// two (Savannah for green-white), and for three or more one of the duals its
// colors make, picked by the commander's name so each deck keeps its own.

const BASICS: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const DUALS: Record<string, string> = {
  WU: "Tundra",
  WB: "Scrubland",
  WR: "Plateau",
  WG: "Savannah",
  UB: "Underground Sea",
  UR: "Volcanic Island",
  UG: "Tropical Island",
  BR: "Badlands",
  BG: "Bayou",
  RG: "Taiga",
};
const ORDER = "WUBRG";

/** A small, stable number for a string, to pick the same option for the same deck every time. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function landFor(colors: string[], seed = ""): string {
  const own = [...ORDER].filter((c) => colors.includes(c));
  if (own.length === 0) return "Wastes";
  if (own.length === 1) return BASICS[own[0]];
  const pairs: string[] = [];
  for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) pairs.push(DUALS[own[i] + own[j]]);
  return pairs[hashString(seed) % pairs.length];
}
