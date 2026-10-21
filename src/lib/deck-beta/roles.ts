// Deck Synergy: what job each card does (ramp, card draw, removal...), read
// from its rules text, and where that puts it in Quadrant Theory, a way of
// rating cards by the part of the game they're good in:
//   Developing: building up early (ramp, card draw, tutors)
//   Behind: catching up to the table (removal, board wipes, lifegain, big creatures)
//   Parity: breaking a board stalemate (one-sided wipes, anthems, evasion)
//   Ahead: closing out a game you're winning (counterspells, protection, finishers)
// The more quadrants a card fits, the better. These are heuristics, not rules.
import type { CardDetails } from "@/lib/types";
import { tutorTarget } from "./combos";

export type Role =
  | "ramp"
  | "draw"
  | "tutor"
  | "removal"
  | "wipe"
  | "onesidedwipe"
  | "lifegain"
  | "bigbody"
  | "anthem"
  | "evasion"
  | "counter"
  | "protection"
  | "finisher";

export type Quadrant = "developing" | "behind" | "parity" | "ahead";
export const QUADRANTS: Quadrant[] = ["developing", "behind", "parity", "ahead"];

export const QUADRANT_INFO: Record<Quadrant, { label: string; question: string; examples: string }> = {
  developing: { label: "Developing", question: "Good while everyone is building up?", examples: "Ramp, card draw, tutors" },
  behind: { label: "Behind", question: "Good when you're catching up to the table?", examples: "Removal, board wipes, lifegain, big blockers" },
  parity: { label: "Parity", question: "Good at breaking a stalemate on the board?", examples: "One-sided wipes, anthems, evasion" },
  ahead: { label: "Ahead", question: "Good at closing out a game you're winning?", examples: "Counterspells, protection, finishers" },
};

export const ROLE_INFO: Record<Role, { label: string; quadrant: Quadrant }> = {
  ramp: { label: "Ramp", quadrant: "developing" },
  draw: { label: "Card draw", quadrant: "developing" },
  tutor: { label: "Tutor", quadrant: "developing" },
  removal: { label: "Removal", quadrant: "behind" },
  wipe: { label: "Board wipe", quadrant: "behind" },
  lifegain: { label: "Lifegain", quadrant: "behind" },
  bigbody: { label: "Big creature", quadrant: "behind" },
  onesidedwipe: { label: "One-sided wipe", quadrant: "parity" },
  anthem: { label: "Anthem", quadrant: "parity" },
  evasion: { label: "Evasion", quadrant: "parity" },
  counter: { label: "Counterspell", quadrant: "ahead" },
  protection: { label: "Protection", quadrant: "ahead" },
  finisher: { label: "Finisher", quadrant: "ahead" },
};

/** The card's rules text, lower-cased, with its own name (and reminder text) taken out. */
function text(card: CardDetails): string {
  let t = card.oracleText.replace(/\([^)]*\)/g, "");
  for (const face of card.name.split(" // ")) {
    t = t.split(face).join("this card");
    if (face.includes(",")) t = t.split(face.split(",")[0]).join("this card");
  }
  return t.toLowerCase();
}

const has = (t: string, ...patterns: RegExp[]) => patterns.some((p) => p.test(t));

/** What jobs a card does. Lands do none (they're counted separately). */
export function cardRoles(card: CardDetails): Set<Role> {
  const roles = new Set<Role>();
  const type = card.typeLine.split(" // ")[0];
  if (/\bLand\b/.test(type)) return roles;
  const t = text(card);
  const keywords = new Set(card.keywords.map((k) => k.toLowerCase()));

  // Developing
  if (
    has(
      t,
      /\{t\}(?:, [^:]*)?: add\b/, // mana rocks and dorks
      /\badd (?:\{[wubrgc]\}|one mana|two mana|three mana|x mana|mana of any)/,
      /search your library for [^.]*\b(?:land|forest|island|swamp|mountain|plains)\b[^.]*onto the battlefield/,
      /put (?:a|up to \w+|x|any number of) land cards? [^.]*onto the battlefield/,
      /play (?:an )?additional lands?/,
      /create (?:a|two|three|x|\w+) treasure/,
      /spells? you cast cost \{\d\} less/,
    )
  ) {
    roles.add("ramp");
  }
  if (has(t, /\bdraw (?:a|an|one|two|three|four|five|six|seven|x|that many) (?:additional )?cards?/, /\bdraw cards equal/, /exile the top [^.]*(?:you may play|you may cast)/)) {
    roles.add("draw");
  }
  if (tutorTarget(card)) roles.add("tutor");

  // Behind
  if (
    has(
      t,
      /\bdestroy (?:up to (?:one|two) )?(?:another )?target\b/,
      // Not "exile target creature card from a graveyard": that's graveyard hate.
      /\bexile (?:up to (?:one|two) )?(?:another )?target (?:creature|artifact|enchantment|planeswalker|nonland permanent|permanent)(?! cards?\b)/,
      /enchanted creature (?:can't attack|can't block|loses all abilities|doesn't untap)/,
      /enchanted creature is an? [^.]*\bloses all abilities/,
      /deals? (?:\d+|x|damage equal to [^.]*) damage to (?:any target|target creature|target planeswalker|target player or planeswalker)/,
      /return target (?:creature|nonland permanent|permanent|artifact|enchantment)[^.]* to its owner'?s hand/,
      /target creature (?:an opponent controls )?gets -\d+\/-\d+|target creature gets -x\/-x/,
      /\bfights?\b (?:another )?target creature/,
      /target (?:player|opponent) sacrifices/,
      /each opponent sacrifices (?:a|an|one|two)/,
    )
  ) {
    roles.add("removal");
  }
  const massRemoval = has(
    t,
    /\b(?:destroy|exile) all (?:other )?(?:creatures|nonland permanents|permanents|artifacts|enchantments|planeswalkers|nontoken)/,
    /\b(?:destroy|exile) each (?:other )?(?:creature|nonland permanent|artifact|enchantment)/,
    /deals? (?:\d+|x) damage to each creature/,
    /all creatures get -\d+\/-\d+|all creatures get -x\/-x/,
    /return all (?:other )?(?:creatures|nonland permanents)/,
    /each player sacrifices all/,
  );
  const oneSided = has(
    t,
    /(?:destroy|exile|return) (?:all|each) [^.]*(?:you don't control|your opponents control|an opponent controls)/,
    /deals? (?:\d+|x) damage to each creature (?:you don't control|your opponents control)/,
    /creatures your opponents control get -/,
  );
  if (oneSided) roles.add("onesidedwipe");
  else if (massRemoval) roles.add("wipe");
  if (has(t, /\byou gain (?:\d+|x|that much|an amount of) life/, /\bgains? \d+ life\b/) || keywords.has("lifelink")) roles.add("lifegain");
  if (/\bCreature\b/.test(type) && (Number(card.power) >= 6 || Number(card.toughness) >= 6)) roles.add("bigbody");

  // Parity
  if (
    has(
      t,
      /creatures you control (?:gain [^.]*? and )?get \+(?:\d+|x)\/\+(?:\d+|x)/,
      /put a \+1\/\+1 counter on each creature you control/,
    )
  ) {
    roles.add("anthem");
  }
  if (
    has(
      t,
      /creatures you control (?:gain|have) [^.]*\b(?:flying|trample|menace|shadow|fear|intimidate|horsemanship)\b/,
      /creatures you control (?:gain|have) [^.]*can't be blocked/,
      /\bcan't be blocked\b/,
      /additional combat phase/,
    )
  ) {
    roles.add("evasion");
  }

  // Ahead
  if (/\bcounter target (?:spell|activated|triggered|noncreature|creature|instant|sorcery|artifact|enchantment)/.test(t)) roles.add("counter");
  if (
    has(
      t,
      /(?:permanents|creatures|artifacts|other permanents) you control (?:gain|have) [^.]*\b(?:hexproof|indestructible|shroud|protection from)/,
      /(?:target|another target) (?:creature|permanent|artifact)[^.]* you control (?:gains?|has) [^.]*\b(?:hexproof|indestructible|shroud|protection from)/,
      /equipped creature (?:has|gains) [^.]*\b(?:hexproof|indestructible|shroud|protection from)/,
      /enchanted creature (?:has|gains) [^.]*\b(?:hexproof|indestructible|shroud|protection from)/,
      /(?:phase out|phases out)/,
      /can't be countered/,
      /you have hexproof/,
    )
  ) {
    roles.add("protection");
  }
  if (has(t, /each opponent loses (?:\d+|x|that much|half)/, /\byou win the game\b/, /target opponent loses the game/, /take an extra turn/)) roles.add("finisher");

  return roles;
}

export function quadrantsOf(roles: Set<Role>): Set<Quadrant> {
  return new Set([...roles].map((r) => ROLE_INFO[r].quadrant));
}

/** Rough guides for a 100-card Commander deck (lands aside), from common deckbuilding advice. */
export const ROLE_TARGETS: Partial<Record<Role, number>> = {
  ramp: 10,
  draw: 10,
  removal: 8,
  wipe: 2,
  protection: 3,
};

export const QUADRANT_TARGETS: Record<Quadrant, number> = { developing: 22, behind: 12, parity: 6, ahead: 5 };

export interface DeckProfile {
  /** Cards doing each job (one entry per card, not per copy). */
  roles: Record<Role, string[]>;
  quadrants: Record<Quadrant, string[]>;
  /** Cards that fit two or more quadrants: the most flexible ones. */
  flexible: string[];
  /** Nonland cards that fit no quadrant. */
  noQuadrant: string[];
  /** One-sided and symmetrical wipes together, for the wipe target. */
  wipes: number;
  lands: number;
  /** The deck has blue, so counterspells are an option. */
  blue: boolean;
}

export function deckProfile(cards: { card: CardDetails; qty: number }[], colors: string[]): DeckProfile {
  const roles = Object.fromEntries(Object.keys(ROLE_INFO).map((r) => [r, [] as string[]])) as Record<Role, string[]>;
  const quadrants = Object.fromEntries(QUADRANTS.map((q) => [q, [] as string[]])) as Record<Quadrant, string[]>;
  const flexible: string[] = [];
  const noQuadrant: string[] = [];
  let lands = 0;
  for (const { card, qty } of cards) {
    if (/\bLand\b/.test(card.typeLine.split(" // ")[0])) {
      lands += qty;
      continue;
    }
    const r = cardRoles(card);
    for (const role of r) roles[role].push(card.name);
    const q = quadrantsOf(r);
    for (const quadrant of q) quadrants[quadrant].push(card.name);
    if (q.size >= 2) flexible.push(card.name);
    if (q.size === 0) noQuadrant.push(card.name);
  }
  return { roles, quadrants, flexible, noQuadrant, wipes: roles.wipe.length + roles.onesidedwipe.length, lands, blue: colors.includes("U") };
}

/** How many more of each job the deck could use, by the guides above. Zero when it has enough. */
export function roleGaps(profile: DeckProfile): Partial<Record<Role, number>> {
  const gaps: Partial<Record<Role, number>> = {};
  for (const [role, target] of Object.entries(ROLE_TARGETS) as [Role, number][]) {
    const have = role === "wipe" ? profile.wipes : profile.roles[role].length;
    if (have < target) gaps[role] = target - have;
  }
  if (profile.blue && profile.roles.counter.length < 2) gaps.counter = 2 - profile.roles.counter.length;
  return gaps;
}

export function quadrantGaps(profile: DeckProfile): Partial<Record<Quadrant, number>> {
  const gaps: Partial<Record<Quadrant, number>> = {};
  for (const q of QUADRANTS) {
    const have = profile.quadrants[q].length;
    if (have < QUADRANT_TARGETS[q]) gaps[q] = QUADRANT_TARGETS[q] - have;
  }
  return gaps;
}
