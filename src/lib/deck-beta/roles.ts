// What job each card does (ramp, card advantage, removal...), read from its
// rules text, and which parts of the deckbuilding template it fills. The
// template (The Command Zone's) for a 100-card Commander deck:
//   38 lands, 10–12 ramp, 12 card advantage, 12 targeted disruption,
//   6 mass disruption, and about 30 cards for the deck's plan (its enablers,
//   payoffs and enhancers).
// The categories add up to more than 99 on purpose: the best cards fill
// several at once (a creature that ramps and draws), which is what makes them
// flexible. These are heuristics read from rules text, not rules.
import type { CardDetails } from "@/lib/types";
import { tutorTarget } from "./combos";
import { manaCurve, type CurveReport } from "./curve";

export type Role =
  | "ramp"
  | "draw"
  | "tutor"
  | "removal"
  | "counter"
  | "wipe"
  | "onesidedwipe"
  | "fog"
  | "tax"
  | "protection"
  | "finisher"
  | "enhancer";

export const ROLE_LABEL: Record<Role, string> = {
  ramp: "Ramp",
  draw: "Card advantage",
  tutor: "Tutor",
  removal: "Removal",
  counter: "Counterspell",
  wipe: "Board wipe",
  onesidedwipe: "One-sided wipe",
  fog: "Fog",
  tax: "Tax",
  protection: "Protection",
  finisher: "Finisher",
  enhancer: "Enhancer",
};

/** The template's categories (lands are counted on their own). */
export type Category = "ramp" | "advantage" | "targeted" | "mass" | "plan";
export const CATEGORIES: Category[] = ["ramp", "advantage", "targeted", "mass", "plan"];

export const CATEGORY_INFO: Record<Category, { label: string; target: number; about: string }> = {
  ramp: { label: "Ramp", target: 10, about: "Mana beyond a land a turn: 10 to 12, the cheap ones first." },
  advantage: { label: "Card advantage", target: 12, about: "Cards that net you extra cards, not just selection." },
  targeted: { label: "Targeted disruption", target: 12, about: "One-for-one removal and counterspells for the threat that matters." },
  mass: { label: "Mass disruption", target: 6, about: "Board wipes, fogs and taxes that reset or slow the table." },
  plan: { label: "Plan", target: 30, about: "What the deck does: enablers, payoffs and enhancers." },
};

/** The roles that put a card in each category. Plan cards also come from the deck's playstyle. */
const CATEGORY_ROLES: Record<Exclude<Category, "plan">, Role[]> = {
  ramp: ["ramp"],
  advantage: ["draw"],
  targeted: ["removal", "counter"],
  mass: ["wipe", "onesidedwipe", "fog", "tax"],
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
  const spell = /\b(?:Instant|Sorcery)\b/.test(type);

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

  // Card advantage nets cards: drawing two or more, drawing again and again, a
  // permanent that draws as it arrives (a body and a card), or playing cards off
  // the top. A spell that only draws one ("Draw a card" after a scry) just
  // replaces itself, which is selection, not advantage.
  if (
    has(
      t,
      /\bdraws? (?:two|three|four|five|six|seven|x|that many) (?:additional )?cards?/,
      /\bdraw cards equal/,
      /\bdraws? (?:a|an|one) card for each\b/,
      /(?:whenever|at the beginning of)[^.]*\bdraws? (?:a|an|one|an additional) card/,
      /\}[^:.]*: [^.]*\bdraw (?:a|an|one) card/,
      /exile the top [^.]*(?:you may play|you may cast)/,
    ) ||
    (!spell && /\bdraw (?:a|an|one) card/.test(t))
  ) {
    roles.add("draw");
  }
  if (tutorTarget(card)) roles.add("tutor");

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
  if (/\bcounter target (?:spell|activated|triggered|noncreature|creature|instant|sorcery|artifact|enchantment)/.test(t)) roles.add("counter");

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
  if (/prevent all combat damage that would be dealt/.test(t)) roles.add("fog");
  if (
    has(
      t,
      /can't attack you(?: or (?:a )?planeswalkers? you control)? unless/,
      /spells your opponents cast cost \{\d\} more/,
      /creatures your opponents control enter (?:the battlefield )?tapped/,
      /each opponent can't cast more than one spell each turn/,
    )
  ) {
    roles.add("tax");
  }

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
  // Force multipliers: doublers and extra triggers make the rest of the plan count twice.
  if (has(t, /\btwice that many\b/, /\bdouble that damage\b/, /\bdouble the (?:number|amount|damage)\b/, /\btriggers? an additional time\b/)) {
    roles.add("enhancer");
  }

  return roles;
}

/**
 * The template categories a card fills. Finishers and enhancers are always part
 * of the plan; `plan` adds the card to it when the deck's playstyle uses it.
 */
export function categoriesOf(roles: Set<Role>, plan = false): Category[] {
  const out = (Object.entries(CATEGORY_ROLES) as [Category, Role[]][]).filter(([, r]) => r.some((role) => roles.has(role))).map(([c]) => c);
  if (plan || roles.has("finisher") || roles.has("enhancer")) out.push("plan");
  return out;
}

export interface DeckProfile {
  /** Cards doing each job (one entry per card, not per copy). */
  roles: Record<Role, string[]>;
  /** Cards in each template category. */
  categories: Record<Category, string[]>;
  /** Cards that fill two or more categories, and which: the flexible ones. */
  flexible: { name: string; categories: Category[] }[];
  /** Nonland cards that fill no category: the first places to look for cuts. */
  unplaced: string[];
  lands: number;
  /** The nonland cards' mana curve (the commander left out). */
  curve: CurveReport;
}

export function deckProfile(
  cards: { card: CardDetails; qty: number }[],
  { commander, isPlan = () => false }: { commander?: string; isPlan?: (name: string) => boolean } = {},
): DeckProfile {
  const roles = Object.fromEntries(Object.keys(ROLE_LABEL).map((r) => [r, [] as string[]])) as Record<Role, string[]>;
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, [] as string[]])) as Record<Category, string[]>;
  const flexible: DeckProfile["flexible"] = [];
  const unplaced: string[] = [];
  let lands = 0;
  for (const { card, qty } of cards) {
    if (/\bLand\b/.test(card.typeLine.split(" // ")[0])) {
      lands += qty;
      continue;
    }
    if (card.name === commander) continue;
    const r = cardRoles(card);
    for (const role of r) roles[role].push(card.name);
    const c = categoriesOf(r, isPlan(card.name));
    for (const category of c) categories[category].push(card.name);
    if (c.length >= 2) flexible.push({ name: card.name, categories: c });
    if (c.length === 0) unplaced.push(card.name);
  }
  return { roles, categories, flexible, unplaced, lands, curve: manaCurve(cards, commander) };
}

/** How many more of each category the deck could use, by the template. Zero when it has enough. */
export function categoryGaps(profile: DeckProfile): Partial<Record<Category, number>> {
  const gaps: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) {
    const have = profile.categories[c].length;
    if (have < CATEGORY_INFO[c].target) gaps[c] = CATEGORY_INFO[c].target - have;
  }
  return gaps;
}
