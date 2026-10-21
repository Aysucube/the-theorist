// Deck Synergy: upgrade picks built from what the deck already has. Candidates
// are EDHREC's cards for the commander; each is read for its jobs (roles.ts)
// and scored by how often these decks play it, its synergy, how many quadrants
// it covers, and whether it fills a job the deck is short on.
import type { CardDetails } from "@/lib/types";
import { cardRoles, quadrantsOf, QUADRANTS, type DeckProfile, type Quadrant, type Role } from "./roles";

export interface Candidate {
  card: CardDetails;
  /** EDHREC synergy with the commander (-1 to 1). */
  synergy?: number;
  /** Share of the commander's decks that run it (0–1). */
  inclusion?: number;
}

export interface Pick extends Candidate {
  roles: Role[];
  quadrants: Quadrant[];
  score: number;
}

export interface UpgradePlan {
  /** Card draw and tutors: see more of your deck, find your best cards. */
  consistency: Pick[];
  ramp: Pick[];
  /** For each quadrant the deck is short in (weakest first), cards that cover it. */
  quadrants: { quadrant: Quadrant; short: number; picks: Pick[] }[];
}

/** How much to favour a card for each quadrant beyond the first. */
const FLEXIBLE_BONUS = 0.25;
/** How much to favour a card that does a job the deck is short on. */
const NEED_BONUS = 0.3;

export function scoreCandidate(candidate: Candidate, gaps: Partial<Record<Role, number>>): Pick {
  const roles = [...cardRoles(candidate.card)];
  const quadrants = [...quadrantsOf(new Set(roles))];
  const needed = roles.some((r) => (gaps[r] ?? 0) > 0);
  const score =
    (candidate.inclusion ?? 0) +
    Math.max(0, candidate.synergy ?? 0) * 0.8 +
    FLEXIBLE_BONUS * Math.max(0, quadrants.length - 1) +
    (needed ? NEED_BONUS : 0);
  return { ...candidate, roles, quadrants, score };
}

export function planUpgrades(
  profile: DeckProfile,
  roleGaps: Partial<Record<Role, number>>,
  quadrantGaps: Partial<Record<Quadrant, number>>,
  candidates: Candidate[],
  inDeck: (name: string) => boolean,
  perGroup = 6,
): UpgradePlan {
  const picks = candidates
    .filter((c) => !inDeck(c.card.name) && !/\bLand\b/.test(c.card.typeLine.split(" // ")[0]))
    .map((c) => scoreCandidate(c, roleGaps))
    .filter((p) => p.roles.length > 0)
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));

  // Each card is offered once, in the first group it fits.
  const used = new Set<string>();
  const take = (fits: (p: Pick) => boolean) => {
    const chosen = picks.filter((p) => fits(p) && !used.has(p.card.name)).slice(0, perGroup);
    chosen.forEach((p) => used.add(p.card.name));
    return chosen;
  };

  const consistency = take((p) => p.roles.includes("draw") || p.roles.includes("tutor"));
  const ramp = take((p) => p.roles.includes("ramp"));
  const quadrants = QUADRANTS.filter((q) => (quadrantGaps[q] ?? 0) > 0)
    .sort((a, b) => (quadrantGaps[b] ?? 0) / profileTarget(profile, b) - (quadrantGaps[a] ?? 0) / profileTarget(profile, a))
    .map((quadrant) => ({
      quadrant,
      short: quadrantGaps[quadrant] ?? 0,
      // Flexible cards first: the more quadrants, the better.
      picks: take((p) => p.quadrants.includes(quadrant)).sort((a, b) => b.quadrants.length - a.quadrants.length || b.score - a.score),
    }))
    .filter((g) => g.picks.length > 0);
  return { consistency, ramp, quadrants };
}

/** A quadrant's size relative to what the deck has, to rank which gap is worst. */
function profileTarget(profile: DeckProfile, q: Quadrant) {
  return Math.max(1, profile.quadrants[q].length + 1);
}
