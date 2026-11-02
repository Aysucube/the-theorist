// The mana base: what kind of land each one is, how a commander's colors
// shape the lands it wants, and how good a land is for that deck.
//   One color: mostly basics (25 to 30) and room for 8 to 10 utility lands.
//   Two colors: untapped duals and fetches, and a couple of bounce lands.
//   Three colors: more fixing, lands that tap for any color, triomes.
//   Four or five: the most fixing, triomes, and fewer utility lands.
// The more colors, the higher the bar for a dual, and lands that always enter
// tapped cost tempo: basics are often better than slow, tapped duals.
// Fast acceleration matters too: two mana or less (Arcane Signet, Talismans,
// green ramp spells); three-mana rocks are now too slow. Pure, easy to test.
import type { CardDetails } from "@/lib/types";

export type LandKind =
  | "basic"
  /** Enters untapped (or usually does: shocks, checklands, fastlands, battle lands) and makes two or more colors. */
  | "dual"
  /** Fetches a land onto the battlefield, typed or basic (Fabled Passage too). */
  | "fetch"
  /** Three basic land types, enters tapped, cycles: worth it in three or more colors. */
  | "triome"
  /** Taps for any color (Command Tower, City of Brass, Exotic Orchard). */
  | "rainbow"
  /** Returns a land to hand: a land drop that makes two mana. */
  | "bounce"
  /** Does something beyond mana (Rogue's Passage, channel lands, Reliquary Tower). */
  | "utility"
  /** Always enters tapped (guildgates, gain lands): slow. */
  | "tapped"
  | "other";

export const LAND_KIND_LABEL: Record<LandKind, string> = {
  basic: "Basic",
  dual: "Untapped dual",
  fetch: "Fetch land",
  triome: "Triome",
  rainbow: "Any color",
  bounce: "Bounce land",
  utility: "Utility land",
  tapped: "Enters tapped",
  other: "Land",
};

const BASIC_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

export function isLandCard(card: CardDetails): boolean {
  return /\bLand\b/.test(card.typeLine.split(" // ")[0]);
}

/** The colors a land can make, from its mana abilities and basic land types. */
function landColors(card: CardDetails): Set<string> {
  const t = card.oracleText;
  const colors = new Set<string>();
  for (const match of t.matchAll(/\{([WUBRG])\}/g)) colors.add(match[1]);
  const type = card.typeLine.split(" // ")[0];
  BASIC_TYPES.forEach((basic, i) => {
    if (new RegExp(`\\b${basic}\\b`).test(type)) colors.add("WUBRG"[i]);
  });
  return colors;
}

/** What kind of land a card is (undefined for nonlands). */
export function landKind(card: CardDetails): LandKind | undefined {
  if (!isLandCard(card)) return undefined;
  const type = card.typeLine.split(" // ")[0];
  if (/\bBasic\b/.test(type)) return "basic";
  const t = card.oracleText.toLowerCase();
  const basicTypes = BASIC_TYPES.filter((b) => new RegExp(`\\b${b}\\b`).test(type)).length;
  if (basicTypes >= 3 && /cycling/.test(t)) return "triome";
  if (/search your library for an? [^.]*(?:plains|island|swamp|mountain|forest|basic land)[^.]* card/.test(t) && /sacrifice/.test(t)) return "fetch";
  if (/return a land you control to its owner'?s hand/.test(t)) return "bounce";
  if (/add one mana of any color|add one mana of any type/.test(t)) return "rainbow";
  // "Enters tapped unless…" (checklands, fastlands, battle lands), "you may pay 2 life" (shocks) or "you may reveal" (snarls) usually come in untapped.
  const alwaysTapped = /enters (?:the battlefield )?tapped\./.test(t) && !/tapped unless|you may pay \d life|you may reveal/.test(t);
  const colors = landColors(card);
  if (alwaysTapped) return "tapped";
  if (colors.size >= 2) return "dual";
  // Beyond its mana: an ability that isn't just "{T}: Add …", or no colored mana at all.
  const abilities = t.split("\n").filter((line) => !/^\(?\{t\}(?:, pay \d life)?: add\b/.test(line.trim()) && line.trim() !== "");
  if (abilities.length > 0 || colors.size === 0) return "utility";
  return "other";
}

/** Lands that fix a deck's colors, beyond plain dual lands. */
export function fixesColors(kind: LandKind): boolean {
  return kind === "fetch" || kind === "triome" || kind === "rainbow" || kind === "bounce";
}

/** The deck's colors a fetch land can find: a basic land is any of them, a typed land only its types. */
export function fetchedColors(card: CardDetails, identity: string[]): string[] {
  const search = card.oracleText.match(/search your library for [^.]*/i)?.[0] ?? "";
  if (/basic land/i.test(search)) return identity;
  return identity.filter((c) => new RegExp(`\\b${BASIC_TYPES["WUBRG".indexOf(c)]}\\b`, "i").test(search));
}

/** Scryfall's search for the lands that make two of these colors, or fetch lands. */
export function fixingLandsQuery(colors: string[]): string {
  const pairs = colors.flatMap((a, i) => colors.slice(i + 1).map((b) => `(produces:${a} produces:${b})`));
  return `t:land -t:basic f:commander id<=${colors.join("")} (${[...pairs, 'o:"search your library"'].join(" or ")})`.toLowerCase();
}

/** The deck's colors a land can make, or find if it's a fetch land. */
export function landSources(card: CardDetails, identity: string[]): string[] {
  const kind = landKind(card);
  if (kind === "rainbow") return identity;
  if (kind === "fetch") return fetchedColors(card, identity);
  const colors = landColors(card);
  return identity.filter((c) => colors.has(c));
}

const ORDER = "WUBRG";

/** How many colored mana symbols of each color the mana costs ask for (hybrid counts half to each). */
export function colorDemand(manaCosts: string[]): Record<string, number> {
  const demand: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const cost of manaCosts) {
    for (const symbol of cost.match(/\{[^}]+\}/g) ?? []) {
      const colors = [...symbol.toUpperCase()].filter((c) => ORDER.includes(c));
      for (const c of colors) demand[c] += 1 / colors.length;
    }
  }
  return demand;
}

/** One color of the deck: what its spells ask for against what its lands make. */
export interface ColorNeed {
  color: string;
  /** Colored mana symbols in the deck's costs. */
  pips: number;
  pipShare: number;
  /** Lands that can make it, copies counted. */
  sources: number;
  sourceShare: number;
  /** How many more of the deck's sources it would need to match its share of the symbols; below zero if it has spare. */
  short: number;
}

export interface ColorDistribution {
  colors: ColorNeed[];
  lands: number;
  /** Lands that make none of the deck's colors. */
  colorless: number;
}

/** A deck's colored mana symbols against the lands that make each color. */
export function colorDistribution(cards: { card: CardDetails; qty: number }[], identity: string[]): ColorDistribution {
  const own = [...ORDER].filter((c) => identity.includes(c));
  const spells = cards.filter(({ card }) => !isLandCard(card));
  const lands = cards.filter(({ card }) => isLandCard(card));
  const demand = colorDemand(spells.flatMap(({ card, qty }) => Array<string>(qty).fill(card.manaCost ?? "")));
  const sourceCount = (color: string) => lands.reduce((sum, { card, qty }) => sum + (landSources(card, own).includes(color) ? qty : 0), 0);
  const totalPips = own.reduce((sum, c) => sum + demand[c], 0);
  const totalSources = own.reduce((sum, c) => sum + sourceCount(c), 0);
  return {
    colors: own.map((color) => {
      const sources = sourceCount(color);
      const pipShare = totalPips ? demand[color] / totalPips : 0;
      return { color, pips: demand[color], pipShare, sources, sourceShare: totalSources ? sources / totalSources : 0, short: Math.round(pipShare * totalSources - sources) };
    }),
    lands: lands.reduce((sum, { qty }) => sum + qty, 0),
    colorless: lands.reduce((sum, { card, qty }) => sum + (landSources(card, own).length === 0 ? qty : 0), 0),
  };
}

export interface ManaBasePlan {
  colors: number;
  lands: number;
  /** About how many basics, and nonbasics (fixing and utility). */
  basics: number;
  nonbasics: number;
  /** Utility lands that fit: plenty in one color, few in five. */
  utilityRoom: number;
  /** What this color count wants, in a sentence. */
  advice: string;
}

/** How a commander's color count shapes its lands. */
export function manaBasePlan(colors: number, lands: number): ManaBasePlan {
  const share = colors <= 1 ? 0.26 : colors === 2 ? 0.37 : colors === 3 ? 0.47 : 0.6;
  const nonbasics = Math.round(lands * share);
  const utilityRoom = colors <= 1 ? 9 : colors === 2 ? 5 : colors === 3 ? 3 : 2;
  const advice =
    colors <= 1
      ? "One color: mostly basics, with room for 8 to 10 utility lands and efficient mana rocks."
      : colors === 2
        ? "Two colors: untapped duals and fetches for fixing, and a couple of bounce lands for the extra mana."
        : colors === 3
          ? "Three colors: plenty of fixing, lands that tap for any color, and triomes."
          : "Four or five colors: as much fixing as you can (fetches, triomes, any-color lands) and green ramp that finds lands.";
  return { colors, lands, basics: lands - nonbasics, nonbasics, utilityRoom, advice };
}

/**
 * How good a land is for a deck of this many colors, as a bonus or penalty
 * for recommendations: untapped fixing and triomes in more colors, utility
 * lands in fewer, and always-tapped lands down (a basic is often better).
 */
export function landFit(kind: LandKind, colors: number): number {
  switch (kind) {
    case "dual":
    case "fetch":
      return colors >= 2 ? 0.6 : -0.1;
    case "triome":
      return colors >= 3 ? 0.5 : -0.3;
    case "rainbow":
      return colors >= 2 ? 0.5 : -0.1;
    case "bounce":
      return colors === 2 ? 0.2 : -0.1;
    case "utility":
      return colors <= 1 ? 0.4 : colors === 2 ? 0.1 : -0.2;
    case "tapped":
      return -0.6;
    default:
      return 0;
  }
}

/** A mana rock (or dork) that costs three or more: too slow now, against two-mana acceleration. */
export function isSlowRamp(card: CardDetails, roles: Set<string>): boolean {
  return roles.has("ramp") && card.cmc >= 3 && /\bArtifact\b/.test(card.typeLine) && /\{t\}(?:, [^:]*)?: add\b/i.test(card.oracleText);
}

export interface ManaBaseReport {
  plan: ManaBasePlan;
  basics: number;
  nonbasics: number;
  /** Lands by kind (names), for the deck's lands. */
  kinds: Partial<Record<LandKind, string[]>>;
  utility: number;
}

/** What a deck's lands are, against the plan for its colors. */
export function manaBase(cards: { card: CardDetails; qty: number }[], colors: number, landTargetCount: number): ManaBaseReport {
  const kinds: Partial<Record<LandKind, string[]>> = {};
  let basics = 0;
  let nonbasics = 0;
  for (const { card, qty } of cards) {
    const kind = landKind(card);
    if (!kind) continue;
    if (kind === "basic") basics += qty;
    else nonbasics += qty;
    (kinds[kind] ??= []).push(card.name);
  }
  return { plan: manaBasePlan(colors, landTargetCount), basics, nonbasics, kinds, utility: kinds.utility?.length ?? 0 };
}
