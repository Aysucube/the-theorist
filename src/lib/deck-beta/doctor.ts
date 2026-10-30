// Upgrade picks built from what the deck already has, by the deckbuilding
// template (roles.ts) and the mana curve (curve.ts). Candidates are EDHREC's
// cards for the commander (plus the Game Changers in its colors). Each is read
// for its jobs and scored by how often these decks play it, its synergy, how
// many template categories it fills (flexible cards first), whether it fills a
// category the deck is short of, and how cheap it is: cheap ramp and card
// advantage keep the curve low and let you cast two spells a turn. Higher
// brackets count raw strength too; cards that would push the deck past the
// chosen bracket are left out.
import type { CardDetails } from "@/lib/types";
import { isExtraTurn, isMassLandDenial, MAX_GAME_CHANGERS, type Bracket } from "./bracket";
import { cheapness, EARLY_SHARE, type CurveReport } from "./curve";
import { isSlowRamp } from "./lands";
import { CATEGORIES, CATEGORY_INFO, cardRoles, categoriesOf, categoryGaps, type Category, type DeckProfile, type Role } from "./roles";

export interface Candidate {
  card: CardDetails;
  /** EDHREC synergy with the commander (-1 to 1). */
  synergy?: number;
  /** Share of the commander's decks that run it (0–1). */
  inclusion?: number;
  /** In the player's binder (Create Commander Deck favours what they own). */
  owned?: boolean;
}

export interface Pick extends Candidate {
  roles: Role[];
  /** The template categories it fills; two or more makes it flexible. */
  categories: Category[];
  score: number;
  gameChanger: boolean;
  extraTurn: boolean;
  /** The bracket of the strongest combo it would complete, if any. */
  completes?: Bracket;
}

export interface UpgradePlan {
  /** Cheap ramp (2 mana or less) and card advantage (3 or less): they keep the curve low and fill the early turns. */
  curve: Pick[];
  /** Cards that fill two or more template categories. */
  flexible: Pick[];
  /** For each category the deck is short of (worst first), cards that fill it. */
  categories: { category: Category; short: number; picks: Pick[] }[];
  /** Game Changers the bracket has room for, then (Bracket 4+) other strong cards. */
  power: Pick[];
  /** Good candidates left out because they'd push the deck past the bracket. */
  leftOut: { pick: Pick; why: string }[];
  /** Every card the bracket allows, best first, with only as many Game Changers as it has room for. */
  eligible: Pick[];
}

export interface PlanOptions {
  /** The bracket to build toward; without one, nothing is left out. */
  bracket?: Bracket;
  perGroup?: number;
  isGameChanger?: (name: string) => boolean;
  /** Game Changers the deck already runs. */
  gameChangersInDeck?: number;
  /** The highest bracket of a combo each card would complete, if it would. */
  completes?: (name: string) => Bracket | undefined;
  /** How much to favour cards the player owns. */
  ownedBonus?: number;
  /** Whether a candidate is part of the deck's plan (by default: strong EDHREC synergy with the commander). */
  isPlan?: (candidate: Candidate) => boolean;
  /** The deck's curve: one that's top-heavy or short of early plays leans harder on cheap cards. */
  curve?: CurveReport;
}

// Lower brackets favour synergy and flexible cards; higher ones raw strength.
// Cheapness counts in every bracket: a low curve is what makes a deck steady.
const WEIGHTS: Record<Bracket, { inclusion: number; synergy: number; flexible: number; need: number; cheap: number; gameChanger: number; strength: number }> = {
  1: { inclusion: 0.6, synergy: 1, flexible: 0.4, need: 0.3, cheap: 0.3, gameChanger: 0, strength: 0 },
  2: { inclusion: 0.8, synergy: 0.9, flexible: 0.35, need: 0.3, cheap: 0.3, gameChanger: 0, strength: 0.05 },
  3: { inclusion: 1, synergy: 0.8, flexible: 0.3, need: 0.3, cheap: 0.3, gameChanger: 0.2, strength: 0.1 },
  4: { inclusion: 1.1, synergy: 0.6, flexible: 0.25, need: 0.25, cheap: 0.35, gameChanger: 0.5, strength: 0.3 },
  5: { inclusion: 1.2, synergy: 0.4, flexible: 0.2, need: 0.2, cheap: 0.4, gameChanger: 0.7, strength: 0.45 },
};

/** Three-mana rocks are too slow now: two-mana acceleration does the same job a turn sooner. */
const SLOW_RAMP = 0.25;

/** How much a card counts when the commander's decks on EDHREC don't play it. */
const UNSEEN = 0.6;
/** Synergy at which an EDHREC card counts as part of the deck's plan. */
const PLAN_SYNERGY = 0.15;
const defaultIsPlan = (c: Candidate) => (c.synergy ?? 0) >= PLAN_SYNERGY;

/** How hard the deck needs cheap cards: more when it's top-heavy or short of early plays. */
export function curvePressure(curve: CurveReport | undefined): number {
  if (!curve || curve.spells < 8) return 1;
  if (curve.topHeavy) return 1.6;
  return curve.early / curve.spells < EARLY_SHARE ? 1.3 : 1;
}

/** Signs of a strong card for higher brackets (0–1): tutors, fast mana, free spells, cheap interaction. */
export function strength(card: CardDetails, roles: Role[]): number {
  const t = card.oracleText.toLowerCase();
  let s = 0;
  if (roles.includes("tutor")) s += 0.5;
  if (roles.includes("ramp") && card.cmc <= 1) s += 0.5;
  if (/rather than pay (?:this spell's|its) mana cost|without paying (?:its|their) mana costs?/.test(t)) s += 0.4;
  if ((roles.includes("removal") || roles.includes("counter")) && card.cmc <= 2) s += 0.3;
  return Math.min(1, s);
}

export function scoreCandidate(candidate: Candidate, gaps: Partial<Record<Category, number>>, options: PlanOptions = {}): Pick {
  const w = WEIGHTS[options.bracket ?? 3];
  const roles = [...cardRoles(candidate.card)];
  const categories = categoriesOf(new Set(roles), (options.isPlan ?? defaultIsPlan)(candidate));
  const needed = categories.some((c) => (gaps[c] ?? 0) > 0);
  const gameChanger = options.isGameChanger?.(candidate.card.name) ?? false;
  // Cheap ramp and card advantage matter most to the curve: they're what you cast early, and twice a turn.
  const curveRole = roles.includes("ramp") || roles.includes("draw");
  const cheap = cheapness(candidate.card.cmc) * w.cheap * curvePressure(options.curve) * (curveRole ? 1.5 : 1);
  const fit =
    (candidate.inclusion ?? 0) * w.inclusion +
    Math.max(0, candidate.synergy ?? 0) * w.synergy +
    w.flexible * Math.max(0, categories.length - 1) +
    (needed ? w.need : 0) +
    cheap -
    (isSlowRamp(candidate.card, new Set(roles)) ? SLOW_RAMP : 0) +
    (gameChanger ? w.gameChanger : 0) +
    strength(candidate.card, roles) * w.strength;
  // Cards EDHREC has never seen in this commander's decks (e.g. Game Changers added for their power) rank lower.
  const score = (candidate.inclusion === undefined ? fit * UNSEEN : fit) + (candidate.owned ? (options.ownedBonus ?? 0) : 0);
  return {
    ...candidate,
    roles,
    categories,
    score,
    gameChanger,
    extraTurn: isExtraTurn(candidate.card),
    completes: options.completes?.(candidate.card.name),
  };
}

/** Why a card doesn't fit the bracket, or undefined if it does. Game Changers are counted separately. */
function aboveBracket(pick: Pick, bracket: Bracket | undefined): string | undefined {
  if (!bracket) return undefined;
  if (pick.gameChanger && MAX_GAME_CHANGERS[bracket] === 0) return `Game Changer: Bracket ${bracket} allows none`;
  if (bracket <= 3 && isMassLandDenial(pick.card)) return `Mass land denial: needs Bracket 4`;
  if (bracket === 1 && pick.extraTurn) return "Extra turn: Bracket 1 allows none";
  const comboLimit = bracket <= 2 ? 2 : bracket === 3 ? 3 : 5;
  if (pick.completes && pick.completes > comboLimit) return `Completes a Bracket ${pick.completes} combo`;
  return undefined;
}

export function planUpgrades(profile: DeckProfile, candidates: Candidate[], inDeck: (name: string) => boolean, options: PlanOptions = {}): UpgradePlan {
  const { bracket, perGroup = 6 } = options;
  const gaps = categoryGaps(profile);
  const opts = { ...options, curve: options.curve ?? profile.curve };
  const scored = candidates
    .filter((c) => !inDeck(c.card.name) && !/\bLand\b/.test(c.card.typeLine.split(" // ")[0]))
    .map((c) => scoreCandidate(c, gaps, opts))
    // A card has to do a job in the template, or be strong enough for the higher brackets (tutors, Game Changers).
    .filter((p) => p.categories.length > 0 || p.gameChanger || p.roles.includes("tutor"))
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));

  const leftOut: UpgradePlan["leftOut"] = [];
  const picks: Pick[] = [];
  for (const p of scored) {
    const why = aboveBracket(p, bracket);
    if (why) leftOut.push({ pick: p, why });
    else picks.push(p);
  }

  // Up to Bracket 3, Game Changers only go in their own group, so it can hold
  // just as many as the bracket has room for.
  const limitGameChangers = bracket !== undefined && MAX_GAME_CHANGERS[bracket] !== Infinity;
  const room = bracket ? Math.max(0, MAX_GAME_CHANGERS[bracket] - (options.gameChangersInDeck ?? 0)) : Infinity;

  // Each card is offered once, in the first group it fits.
  const used = new Set<string>();
  const take = (fits: (p: Pick) => boolean, limit = perGroup) => {
    const chosen = picks.filter((p) => fits(p) && !used.has(p.card.name) && !(limitGameChangers && p.gameChanger)).slice(0, limit);
    chosen.forEach((p) => used.add(p.card.name));
    return chosen;
  };

  // The curve first: cheap mana and cheap cards.
  const curve = take((p) => (p.roles.includes("ramp") && p.card.cmc <= 2) || (p.roles.includes("draw") && p.card.cmc <= 3));
  // Then the cards that do the most jobs at once.
  const flexible = take((p) => p.categories.length >= 2).sort((a, b) => b.categories.length - a.categories.length || b.score - a.score);
  // Then each category the deck is short of, the biggest shortfall (for its size) first; flexible cards lead.
  const categories = CATEGORIES.filter((c) => (gaps[c] ?? 0) > 0)
    .sort((a, b) => (gaps[b] ?? 0) / CATEGORY_INFO[b].target - (gaps[a] ?? 0) / CATEGORY_INFO[a].target)
    .map((category) => ({
      category,
      short: gaps[category] ?? 0,
      picks: take((p) => p.categories.includes(category)).sort((a, b) => b.categories.length - a.categories.length || b.score - a.score),
    }))
    .filter((g) => g.picks.length > 0);

  const power: Pick[] = [];
  let gameChangersLeft = room;
  for (const p of picks) {
    if (power.length >= perGroup || used.has(p.card.name)) continue;
    if (p.gameChanger) {
      if (gameChangersLeft > 0) {
        gameChangersLeft--;
        power.push(p);
      } else if (limitGameChangers) {
        leftOut.push({ pick: p, why: `Game Changer: the deck already has the ${MAX_GAME_CHANGERS[bracket!]} Bracket ${bracket} allows` });
      }
    } else if ((bracket ?? 3) >= 4 && strength(p.card, p.roles) >= 0.5) {
      power.push(p);
    }
  }
  power.forEach((p) => used.add(p.card.name));
  const eligible = picks.filter((p) => !limitGameChangers || !p.gameChanger || power.includes(p));

  leftOut.sort((x, y) => y.pick.score - x.pick.score);
  return { curve, flexible, categories, power, leftOut: leftOut.slice(0, perGroup * 2), eligible };
}

/**
 * Deck cards that push the curve up without pulling their weight: spells of 5
 * mana or more that fill no category (or only the plan, when the deck has plenty
 * of plan cards), most expensive first. Places to cut for a lower curve.
 */
export function curveCuts(cards: CardDetails[], profile: DeckProfile, commander?: string, limit = 6): CardDetails[] {
  const flexible = new Set(profile.flexible.map((f) => f.name));
  const planHeavy = profile.categories.plan.length > CATEGORY_INFO.plan.target;
  const jobs = (name: string) => CATEGORIES.filter((c) => profile.categories[c].includes(name));
  return cards
    .filter((c) => c.name !== commander && c.cmc >= 5 && !/\bLand\b/.test(c.typeLine.split(" // ")[0]) && !flexible.has(c.name))
    .filter((c) => {
      const j = jobs(c.name);
      return j.length === 0 || (planHeavy && j.length === 1 && j[0] === "plan");
    })
    .sort((a, b) => b.cmc - a.cmc || a.name.localeCompare(b.name))
    .slice(0, limit);
}
