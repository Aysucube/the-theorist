// Deck Synergy: upgrade picks built from what the deck already has. Candidates
// are EDHREC's cards for the commander (plus the Game Changers in its colors);
// each is read for its jobs (roles.ts) and scored by how often these decks play
// it, its synergy, how many quadrants it covers, whether it fills a job the
// deck is short on, and, for higher brackets, how strong it is. Cards that
// would push the deck past the chosen bracket are left out.
import type { CardDetails } from "@/lib/types";
import { isExtraTurn, isMassLandDenial, MAX_GAME_CHANGERS, type Bracket } from "./bracket";
import { cardRoles, quadrantsOf, QUADRANTS, type DeckProfile, type Quadrant, type Role } from "./roles";

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
  quadrants: Quadrant[];
  score: number;
  gameChanger: boolean;
  extraTurn: boolean;
  /** The bracket of the strongest combo it would complete, if any. */
  completes?: Bracket;
}

export interface UpgradePlan {
  /** Cards that fit two or more quadrants: the most flexible upgrades. */
  flexible: Pick[];
  /** Card draw and tutors: see more of your deck, find your best cards. */
  consistency: Pick[];
  ramp: Pick[];
  /** For each quadrant the deck is short in (weakest first), cards that cover it. */
  quadrants: { quadrant: Quadrant; short: number; picks: Pick[] }[];
  /** Game Changers the bracket has room for, then (Bracket 4+) other strong cards. */
  power: Pick[];
  /** Good candidates left out because they'd push the deck past the bracket. */
  leftOut: { pick: Pick; why: string }[];
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
}

// Lower brackets favour synergy and flexible cards; higher ones raw strength.
const WEIGHTS: Record<Bracket, { inclusion: number; synergy: number; flexible: number; need: number; gameChanger: number; strength: number }> = {
  1: { inclusion: 0.6, synergy: 1, flexible: 0.4, need: 0.3, gameChanger: 0, strength: 0 },
  2: { inclusion: 0.8, synergy: 0.9, flexible: 0.35, need: 0.3, gameChanger: 0, strength: 0.05 },
  3: { inclusion: 1, synergy: 0.8, flexible: 0.25, need: 0.3, gameChanger: 0.2, strength: 0.1 },
  4: { inclusion: 1.1, synergy: 0.6, flexible: 0.2, need: 0.25, gameChanger: 0.5, strength: 0.3 },
  5: { inclusion: 1.2, synergy: 0.4, flexible: 0.15, need: 0.2, gameChanger: 0.7, strength: 0.45 },
};

/** How much a card counts when the commander's decks on EDHREC don't play it. */
const UNSEEN = 0.6;

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

export function scoreCandidate(candidate: Candidate, gaps: Partial<Record<Role, number>>, options: PlanOptions = {}): Pick {
  const w = WEIGHTS[options.bracket ?? 3];
  const roles = [...cardRoles(candidate.card)];
  const quadrants = [...quadrantsOf(new Set(roles))];
  const needed = roles.some((r) => (gaps[r] ?? 0) > 0);
  const gameChanger = options.isGameChanger?.(candidate.card.name) ?? false;
  const fit =
    (candidate.inclusion ?? 0) * w.inclusion +
    Math.max(0, candidate.synergy ?? 0) * w.synergy +
    w.flexible * Math.max(0, quadrants.length - 1) +
    (needed ? w.need : 0) +
    (gameChanger ? w.gameChanger : 0) +
    strength(candidate.card, roles) * w.strength;
  // Cards EDHREC has never seen in this commander's decks (e.g. Game Changers added for their power) rank lower.
  const score = (candidate.inclusion === undefined ? fit * UNSEEN : fit) + (candidate.owned ? (options.ownedBonus ?? 0) : 0);
  return {
    ...candidate,
    roles,
    quadrants,
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

export function planUpgrades(
  profile: DeckProfile,
  roleGaps: Partial<Record<Role, number>>,
  quadrantGaps: Partial<Record<Quadrant, number>>,
  candidates: Candidate[],
  inDeck: (name: string) => boolean,
  options: PlanOptions = {},
): UpgradePlan {
  const { bracket, perGroup = 6 } = options;
  const scored = candidates
    .filter((c) => !inDeck(c.card.name) && !/\bLand\b/.test(c.card.typeLine.split(" // ")[0]))
    .map((c) => scoreCandidate(c, roleGaps, options))
    .filter((p) => p.roles.length > 0)
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

  // The more quadrants a card fits, the better.
  const flexible = take((p) => p.quadrants.length >= 2).sort((a, b) => b.quadrants.length - a.quadrants.length || b.score - a.score);
  const consistency = take((p) => p.roles.includes("draw") || p.roles.includes("tutor"));
  const ramp = take((p) => p.roles.includes("ramp"));
  const quadrants = QUADRANTS.filter((q) => (quadrantGaps[q] ?? 0) > 0)
    .sort((a, b) => (quadrantGaps[b] ?? 0) / profileTarget(profile, b) - (quadrantGaps[a] ?? 0) / profileTarget(profile, a))
    .map((quadrant) => ({
      quadrant,
      short: quadrantGaps[quadrant] ?? 0,
      // Flexible cards first.
      picks: take((p) => p.quadrants.includes(quadrant)).sort((a, b) => b.quadrants.length - a.quadrants.length || b.score - a.score),
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

  leftOut.sort((x, y) => y.pick.score - x.pick.score);
  return { flexible, consistency, ramp, quadrants, power, leftOut: leftOut.slice(0, perGroup * 2) };
}

/** A quadrant's size relative to what the deck has, to rank which gap is worst. */
function profileTarget(profile: DeckProfile, q: Quadrant) {
  return Math.max(1, profile.quadrants[q].length + 1);
}
