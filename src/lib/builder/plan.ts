// Create Commander Deck: the numbers a deck is built around — how many lands,
// how the basics split across the colors, how many slots are left — and the
// recommendations that grow with the deck: cards for the four quadrants and
// any job it's short on, consistency, combos, playstyles, lands, and cards
// from the binder. Kept free of React so it's easy to test.
import type { PlaystyleCard } from "@/lib/deck-beta/api";
import { comboBracket, isMassLandDenial, type Bracket } from "@/lib/deck-beta/bracket";
import { planUpgrades, scoreCandidate, type Candidate, type Pick, type UpgradePlan } from "@/lib/deck-beta/doctor";
import { cardKey } from "@/lib/deck-beta/recommend";
import { deckProfile, quadrantGaps, roleGaps, type DeckProfile } from "@/lib/deck-beta/roles";
import { byImpact } from "@/lib/deck-beta/walkthrough";
import type { CardDetails, Combo, DeckCombos } from "@/lib/types";

/** A Commander deck: 99 cards and the commander. */
export const DECK_SIZE = 100;
export const MIN_LANDS = 30;
export const MAX_LANDS = 42;

export const BASIC_FOR: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const ORDER = "WUBRG";
/** How much owning a card counts when building from the binder: enough to beat a somewhat more popular card you'd have to buy. */
const OWNED_BONUS = 0.6;

const isLand = (card: Pick["card"]) => /\bLand\b/.test(card.typeLine.split(" // ")[0]);

/** A card fits a commander's deck when the commander's color identity covers the card's. */
export function fitsIdentity(card: { colorIdentity: string[] }, identity: string[]): boolean {
  return card.colorIdentity.every((c) => identity.includes(c));
}

/**
 * How many lands to run: EDHREC's average for the commander when it has one
 * (36 otherwise, a little more for an expensive commander), one fewer for
 * Brackets 4 and 5, whose decks lean on cheap mana and low curves.
 */
export function recommendLands({
  average,
  commanderCmc,
  bracket,
  commander,
}: {
  average?: number;
  commanderCmc: number;
  bracket: Bracket;
  commander: string;
}): { count: number; why: string } {
  const why: string[] = [];
  let count: number;
  if (average && average > 0) {
    count = Math.round(average);
    why.push(`${commander} decks on EDHREC run ${count} lands on average.`);
  } else {
    count = 36 + (commanderCmc >= 6 ? 1 : commanderCmc <= 2 ? -1 : 0);
    why.push(
      commanderCmc >= 6
        ? "Most Commander decks run about 36 lands; an expensive commander wants one more."
        : commanderCmc <= 2
          ? "Most Commander decks run about 36 lands; a cheap commander can do with one fewer."
          : "Most Commander decks run about 36 lands.",
    );
  }
  if (bracket >= 4) {
    count -= 1;
    why.push(`Bracket ${bracket} decks lean on cheap mana rocks and lower curves, so one fewer.`);
  }
  return { count: Math.min(MAX_LANDS, Math.max(MIN_LANDS, count)), why: why.join(" ") };
}

/** How many colored mana symbols of each color the mana costs ask for (hybrid counts half to each). */
function colorDemand(manaCosts: string[]): Record<string, number> {
  const demand: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const cost of manaCosts) {
    for (const symbol of cost.match(/\{[^}]+\}/g) ?? []) {
      const colors = [...symbol.toUpperCase()].filter((c) => ORDER.includes(c));
      for (const c of colors) demand[c] += 1 / colors.length;
    }
  }
  return demand;
}

/**
 * Splits basic lands across the commander's colors, weighted by how many
 * colored symbols the deck's mana costs ask for (every color gets a share).
 * Colorless decks get Wastes. The counts always add up to `total`.
 */
export function splitBasics(total: number, colors: string[], manaCosts: string[]): Record<string, number> {
  const own = [...ORDER].filter((c) => colors.includes(c));
  if (total <= 0) return {};
  if (own.length === 0) return { Wastes: total };
  const demand = colorDemand(manaCosts);
  const weights = own.map((c) => 1 + demand[c]);
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (w / sum) * total);
  const counts = exact.map(Math.floor);
  // Hand out what's left to the largest remainders.
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (let k = 0; k < total - counts.reduce((a, b) => a + b, 0); k++) counts[order[k % order.length].i]++;
  return Object.fromEntries(own.map((c, i) => [BASIC_FOR[c], counts[i]]).filter(([, n]) => (n as number) > 0));
}

export interface BuilderCandidate extends Candidate {
  /** Copies in the binder. */
  ownedCopies: number;
  /** The EDHREC lists it's in ("New Cards", "Lands"...); empty for cards only the binder suggests. */
  lists: string[];
}

export interface BuilderPick extends Pick {
  ownedCopies: number;
  lists: string[];
  /** A one-line reason, e.g. "Completes Infinite green mana". */
  reason?: string;
}

export interface BuilderGroups {
  /** The few cards that would help most right now. */
  next: BuilderPick[];
  flexible: BuilderPick[];
  consistency: BuilderPick[];
  ramp: BuilderPick[];
  quadrants: { quadrant: UpgradePlan["quadrants"][number]["quadrant"]; short: number; picks: BuilderPick[] }[];
  power: BuilderPick[];
  combos: { pick: BuilderPick; combo: Combo }[];
  playstyle: BuilderPick[];
  lands: BuilderPick[];
  binder: BuilderPick[];
  leftOut: UpgradePlan["leftOut"];
}

export interface BuilderInput {
  /** The deck so far, commander included. */
  deck: { card: CardDetails; qty: number }[];
  candidates: BuilderCandidate[];
  identity: string[];
  bracket: Bracket;
  isGameChanger: (name: string) => boolean;
  /** The deck's combos (Commander Spellbook and EDHREC), once known. */
  combos?: DeckCombos | null;
  /** The chosen playstyle's cards from EDHREC, best first. */
  playstyle?: PlaystyleCard[];
  /** Favour cards in the binder. */
  preferOwned: boolean;
  perGroup?: number;
}

/** Recommendations for the deck as it stands; they change as cards go in. */
export function builderRecommendations(input: BuilderInput): BuilderGroups & { profile: DeckProfile } {
  const { deck, identity, bracket, isGameChanger, combos, preferOwned, perGroup = 8 } = input;
  const profile = deckProfile(deck, identity);
  const inDeck = new Set(deck.map((d) => cardKey(d.card.name)));
  const has = (name: string) => inDeck.has(cardKey(name));
  const candidates = input.candidates.filter((c) => fitsIdentity(c.card, identity)).map((c) => ({ ...c, owned: c.ownedCopies > 0 }));
  const byName = new Map(candidates.map((c) => [cardKey(c.card.name), c]));
  const comboLimit = bracket <= 2 ? 2 : bracket === 3 ? 3 : 5;

  // Cards that would complete a combo, by the bracket of the strongest one.
  const completes = new Map<string, Bracket>();
  for (const combo of combos?.almostIncluded ?? []) {
    const level = comboBracket(combo);
    for (const piece of combo.cards.filter((n) => !has(n))) {
      completes.set(cardKey(piece), Math.max(level, completes.get(cardKey(piece)) ?? 1) as Bracket);
    }
  }
  const options = {
    bracket,
    isGameChanger,
    gameChangersInDeck: deck.filter((d) => isGameChanger(d.card.name)).length,
    completes: (n: string) => completes.get(cardKey(n)),
    ownedBonus: preferOwned ? OWNED_BONUS : 0,
    perGroup,
  };
  const asPick = (p: Pick): BuilderPick => {
    const c = byName.get(cardKey(p.card.name));
    return { ...p, ownedCopies: c?.ownedCopies ?? 0, lists: c?.lists ?? [] };
  };
  const plan = planUpgrades(profile, roleGaps(profile), quadrantGaps(profile), candidates, has, options);
  const tooStrong = new Set(plan.leftOut.map((l) => cardKey(l.pick.card.name)));
  const score = (c: BuilderCandidate) => asPick(scoreCandidate(c, roleGaps(profile), options));
  const ownedFirst = (a: BuilderPick, b: BuilderPick) => Number(b.ownedCopies > 0) - Number(a.ownedCopies > 0) || b.score - a.score;

  // Combos a card away that the bracket allows, EDHREC's for the commander first.
  const combosGroup: BuilderGroups["combos"] = [];
  for (const combo of [...(combos?.almostIncluded ?? [])].sort(byImpact)) {
    if (comboBracket(combo) > comboLimit) continue;
    const piece = combo.cards.find((n) => !has(n));
    const candidate = piece ? byName.get(cardKey(piece)) : undefined;
    if (!candidate || combosGroup.some((g) => cardKey(g.pick.card.name) === cardKey(piece!))) continue;
    combosGroup.push({ pick: { ...score(candidate), reason: `Completes ${combo.results[0] ?? "a combo"}` }, combo });
    if (combosGroup.length >= perGroup) break;
  }

  // The chosen playstyle's cards, in EDHREC's order for it, the ones you own first.
  const playstyle = (input.playstyle ?? [])
    .flatMap((p) => {
      const c = byName.get(cardKey(p.name));
      return c && !has(c.card.name) && !tooStrong.has(cardKey(c.card.name)) && !isLand(c.card) ? [c] : [];
    })
    .map(score)
    .sort(ownedFirst)
    .slice(0, perGroup);

  // Lands beyond the basics: EDHREC's for the commander and any in the binder.
  const lands = candidates
    .filter((c) => isLand(c.card) && !has(c.card.name) && !/\bBasic\b/.test(c.card.typeLine) && !(bracket <= 3 && isMassLandDenial(c.card)))
    .map((c) => ({ ...score(c), score: (c.inclusion ?? 0) + Math.max(0, c.synergy ?? 0) }))
    .sort(ownedFirst)
    .slice(0, perGroup);

  // Cards from the binder that do a job, whether or not EDHREC lists them.
  const binder = candidates
    .filter((c) => c.ownedCopies > 0 && !has(c.card.name) && !isLand(c.card) && !tooStrong.has(cardKey(c.card.name)))
    .map(score)
    .filter((p) => p.roles.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, perGroup * 2);

  // Building from the binder: cards you own lead every group (otherwise in the plan's order).
  const arrange = (picks: Pick[]) => {
    const out = picks.map(asPick);
    return preferOwned ? out.map((p, i) => ({ p, i })).sort((a, b) => Number(b.p.ownedCopies > 0) - Number(a.p.ownedCopies > 0) || a.i - b.i).map(({ p }) => p) : out;
  };
  const groups = {
    flexible: arrange(plan.flexible),
    consistency: arrange(plan.consistency),
    ramp: arrange(plan.ramp),
    quadrants: plan.quadrants.map((g) => ({ ...g, picks: arrange(g.picks) })),
    power: arrange(plan.power),
  };
  // Next: the best of the worst gaps first, then consistency, ramp and flexible picks.
  const next: BuilderPick[] = [];
  const seen = new Set<string>();
  for (const pick of [
    ...groups.quadrants.flatMap((g) => g.picks.slice(0, 2)),
    ...groups.consistency.slice(0, 2),
    ...groups.ramp.slice(0, 2),
    ...groups.flexible.slice(0, 2),
    ...combosGroup.slice(0, 1).map((g) => g.pick),
  ]) {
    if (seen.has(cardKey(pick.card.name))) continue;
    seen.add(cardKey(pick.card.name));
    next.push(pick);
    if (next.length >= 6) break;
  }
  if (preferOwned) next.sort((a, b) => Number(b.ownedCopies > 0) - Number(a.ownedCopies > 0));

  return { ...groups, next, combos: combosGroup, playstyle, lands, binder, leftOut: plan.leftOut, profile };
}
