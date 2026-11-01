// Create Commander Deck: the numbers a deck is built around (how many lands,
// how the basics split, how the commander's colors shape the mana base) and
// the recommendations that grow with the deck, one shelf per category of the
// deckbuilding template (ramp, card advantage, targeted and mass disruption,
// its plan). Each shelf holds everything EDHREC lists that fills the category,
// sorted into EDHREC's own lists: New Cards, Top Cards, High Lift, then by card
// type. The plan also takes combo pieces, and lands get a shelf of their own,
// dual lands first, rated for the commander's colors. Chosen playstyles steer
// all of it: every card, in the binder or not, is judged by those playstyles'
// decks, and cards they don't play come last. Then the deck's curve is held
// against the average deck's, to see what to cut. Kept free of React so it's
// easy to test.
import type { BuilderResponse, PlaystyleCard, PlaystyleResponse } from "@/lib/deck-beta/api";
import { comboBracket, isMassLandDenial, type Bracket } from "@/lib/deck-beta/bracket";
import { landTarget, slotOf } from "@/lib/deck-beta/curve";
import { planUpgrades, scoreCandidate, type Candidate, type Pick, type UpgradePlan } from "@/lib/deck-beta/doctor";
import { fetchedColors, fixesColors, LAND_KIND_LABEL, landFit, landKind, manaBasePlan, type ManaBasePlan } from "@/lib/deck-beta/lands";
import { cardKey } from "@/lib/deck-beta/recommend";
import { CATEGORIES, CATEGORY_INFO, categoryGaps, deckProfile, type Category, type DeckProfile } from "@/lib/deck-beta/roles";
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
/** Synergy at which an EDHREC card counts as part of the commander's plan. */
const PLAN_SYNERGY = 0.15;
/** How far a card must lean into a playstyle to be one of its own. */
export const LEANS_IN = 0.05;
/** How many decks a playstyle needs for its own numbers to count half. */
const TRUSTED_DECKS = 20;

/**
 * How far a card leans into a playstyle, 0 if not at all: how much more often
 * its decks play the card than the commander's decks overall (a playstyle's
 * decks mostly share the commander's core, so this is what tells them apart,
 * and it counts for less from only a few decks), or how much more that
 * playstyle's decks in these colors play it than other decks of those colors,
 * whichever is higher.
 */
export function styleLean(share: number | undefined, shareOverall: number | undefined, decks: number, colorSynergy: number | undefined): number {
  const lift = ((share ?? 0) - (shareOverall ?? 0)) * (decks / (decks + TRUSTED_DECKS));
  return Math.max(0, lift, colorSynergy ?? 0);
}

const isLand = (card: Pick["card"]) => /\bLand\b/.test(card.typeLine.split(" // ")[0]);

/** A card fits a commander's deck when the commander's color identity covers the card's. */
export function fitsIdentity(card: { colorIdentity: string[] }, identity: string[]): boolean {
  return card.colorIdentity.every((c) => identity.includes(c));
}

/**
 * What a commander's deck will likely cost to cast before any card is picked:
 * the average mana value of the nonland cards its decks on EDHREC play most.
 */
export function predictedAverage(candidates: { card: CardDetails; inclusion?: number }[], limit = 60): number | undefined {
  const top = candidates
    .filter((c) => !isLand(c.card) && c.inclusion !== undefined)
    .sort((a, b) => (b.inclusion ?? 0) - (a.inclusion ?? 0))
    .slice(0, limit);
  return top.length >= 10 ? top.reduce((sum, c) => sum + c.card.cmc, 0) / top.length : undefined;
}

/**
 * How many lands to run, by the curve: 38 for a mid-range deck, 33 to 35 for
 * a low curve, 39 or 40 for a high one (see deck-beta/curve.ts).
 */
export function recommendLands({ curveAverage }: { curveAverage?: number }): { count: number; why: string } {
  const { count, why } = landTarget(curveAverage);
  return { count: Math.min(MAX_LANDS, Math.max(MIN_LANDS, count)), why };
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
  const left = total - counts.reduce((a, b) => a + b, 0);
  for (let k = 0; k < left; k++) counts[order[k % order.length].i]++;
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
  /** A one-line reason, e.g. "Completes Infinite green mana" or "Untapped dual". */
  reason?: string;
}

/** EDHREC's lists on a commander's page, in its order. */
const EDHREC_LISTS = ["New Cards", "Top Cards", "High Lift Cards", "High Synergy Cards", "Game Changers", "Creatures", "Instants", "Sorceries", "Utility Artifacts", "Mana Artifacts", "Enchantments", "Planeswalkers", "Battles"];

/** The EDHREC list a card sits in, the first if it's in several; for a card EDHREC doesn't list, the one for its type. */
function listFor(pick: BuilderPick): string {
  const listed = EDHREC_LISTS.find((list) => pick.lists.includes(list));
  if (listed) return listed;
  const type = pick.card.typeLine.split(" // ")[0];
  if (/\bCreature\b/.test(type)) return "Creatures";
  if (/\bPlaneswalker\b/.test(type)) return "Planeswalkers";
  if (/\bInstant\b/.test(type)) return "Instants";
  if (/\bSorcery\b/.test(type)) return "Sorceries";
  if (/\bEnchantment\b/.test(type)) return "Enchantments";
  if (/\bBattle\b/.test(type)) return "Battles";
  return pick.roles.includes("ramp") ? "Mana Artifacts" : "Utility Artifacts";
}

/** One category of the template, and every card that fills it. */
export interface TemplateShelf {
  category: Category;
  /** How many more it wants; 0 once it's filled. */
  short: number;
  /** With a playstyle chosen, the cards that set it apart, leaning furthest first. */
  leaning: BuilderPick[];
  /** The rest in EDHREC's lists, in its order, each card once and the highest synergy first. */
  lists: { title: string; picks: BuilderPick[] }[];
  /** With a playstyle chosen, cards that fill it but that its decks don't play. */
  outside: BuilderPick[];
  /** Every card that fills it, to look through by mana value: the most synergistic first in each part, whether you own them or not. */
  all: { leaning: BuilderPick[]; synergy: BuilderPick[]; rest: BuilderPick[] };
}

/** A spell in the deck, and what a cut would cost. */
export interface CurveCut {
  card: CardDetails;
  why: string;
}

/** One mana value of the deck against the curve it's aiming for. */
export interface CurveSlot {
  slot: number;
  have: number;
  target: number;
  /** The deck's spells at this cost, the first to cut at the front. */
  cards: CurveCut[];
}

/** The lands to add on top of the basics that come with the deck, each in the order to add it. */
export interface LandShelf {
  /** Make two or more of the deck's colors and enter untapped, or usually do. */
  duals: BuilderPick[];
  /** Fetch lands, triomes, bounce lands and lands that tap for any color. */
  fixing: BuilderPick[];
  utility: BuilderPick[];
  /** Always enter tapped, so they come last: a basic is often better. */
  slow: BuilderPick[];
}

export interface BuilderGroups {
  /** Every category of the template, in its usual order. */
  template: TemplateShelf[];
  /** Pieces for combos a card away, for the plan (those not already on its shelf above them). */
  combos: { pick: BuilderPick; combo: Combo }[];
  lands: LandShelf;
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
  /** The chosen playstyles' cards from EDHREC, best first. */
  playstyle?: PlaystylePick[];
  /** The average deck's spells at each mana value, from EDHREC: the curve to aim for. */
  curveCounts?: number[];
  /** Favour cards in the binder. */
  preferOwned: boolean;
  /** The commander, left out of the curve. */
  commander?: string;
  /** The land count chosen, for the mana base plan. */
  lands?: number;
  perGroup?: number;
}
type PlaystylePick = PlaystyleCard;
type CommanderData = Extract<BuilderResponse, { found: true }>;

type FoundPlaystyle = Extract<PlaystyleResponse, { found: true }>;

/** What EDHREC knows about a commander, narrowed to the decks of a playstyle. */
export function withPlaystyle(data: CommanderData, style: FoundPlaystyle): CommanderData {
  return {
    ...data,
    numDecks: style.numDecks,
    averages: style.averages ?? data.averages,
    bracketCounts: Object.keys(style.bracketCounts ?? {}).length > 0 ? style.bracketCounts : data.bracketCounts,
    curveAverage: style.curveAverage ?? data.curveAverage,
    curveCounts: style.curveCounts ?? data.curveCounts,
    cards: style.cards.map((c) => ({ ...c, lists: c.lists ?? [] })),
    details: { ...data.details, ...style.details },
  };
}

/**
 * Several playstyles read as one: every card any of them plays, with its best
 * numbers. How far a card leans in is measured against each playstyle's own top
 * card, or a playstyle built on a creature type would drown out the rest, and
 * added up, so a card that suits two of them rises above one that suits one.
 */
export function mergePlaystyles(chosen: { name: string; style: FoundPlaystyle }[]): FoundPlaystyle | undefined {
  if (chosen.length <= 1) return chosen[0]?.style;
  const cards = new Map<string, PlaystyleCard>();
  for (const { name, style } of chosen) {
    const top = Math.max(LEANS_IN, ...style.cards.map((c) => c.lean ?? 0));
    for (const card of style.cards) {
      const seen = cards.get(card.name);
      const leans = (card.lean ?? 0) >= LEANS_IN;
      cards.set(card.name, {
        ...card,
        synergy: seen?.synergy !== undefined && (card.synergy ?? -1) < seen.synergy ? seen.synergy : card.synergy,
        inclusion: Math.max(seen?.inclusion ?? 0, card.inclusion ?? 0),
        numDecks: (seen?.numDecks ?? 0) + card.numDecks,
        lists: [...new Set([...(seen?.lists ?? []), ...(card.lists ?? [])])],
        lean: (seen?.lean ?? 0) + (leans ? card.lean! / top : 0),
        styles: [...(seen?.styles ?? []), ...(leans ? [name] : [])],
      });
    }
  }
  const numDecks = chosen.reduce((sum, c) => sum + c.style.numDecks, 0);
  const weighted = chosen.filter((c) => c.style.curveAverage !== undefined);
  const weight = weighted.reduce((sum, c) => sum + c.style.numDecks, 0);
  const curved = chosen.filter((c) => c.style.curveCounts);
  const bracketCounts: Record<string, number> = {};
  for (const { style } of chosen) for (const [bracket, count] of Object.entries(style.bracketCounts ?? {})) bracketCounts[bracket] = (bracketCounts[bracket] ?? 0) + count;
  return {
    found: true,
    url: chosen[0].style.url,
    numDecks,
    averages: [...chosen].sort((a, b) => b.style.numDecks - a.style.numDecks)[0].style.averages,
    bracketCounts,
    curveAverage: weight > 0 ? weighted.reduce((sum, c) => sum + c.style.curveAverage! * c.style.numDecks, 0) / weight : undefined,
    curveCounts: curved.length > 0 ? [0, 1, 2, 3, 4, 5].map((slot) => curved.reduce((sum, c) => sum + c.style.curveCounts![slot] * c.style.numDecks, 0)) : undefined,
    cards: [...cards.values()].sort((a, b) => (b.lean ?? 0) - (a.lean ?? 0) || (b.synergy ?? -1) - (a.synergy ?? -1)),
    listed: [...cards.keys()],
    details: Object.assign({}, ...chosen.map((c) => c.style.details)),
  };
}

/** An average deck's curve, scaled to this many spells, in whole cards that add up. */
export function scaledCurve(counts: number[], spells: number): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((n) => (n / total) * spells);
  const out = exact.map(Math.floor);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  const left = spells - out.reduce((a, b) => a + b, 0);
  for (let k = 0; k < left; k++) out[order[k % order.length].i]++;
  return out;
}

/** Recommendations for the deck as it stands; they change as cards go in. */
export function builderRecommendations(input: BuilderInput): BuilderGroups & { profile: DeckProfile; manaBase: ManaBasePlan; curveSlots: CurveSlot[] } {
  const { deck, identity, bracket, isGameChanger, combos, preferOwned, perGroup = 12 } = input;
  // Chosen playstyles decide everything below: their decks' numbers stand in for
  // the commander's, and a card they don't play (from EDHREC's other decks or
  // only the binder) counts as unseen.
  const style = new Map((input.playstyle ?? []).map((p) => [cardKey(p.name), p]));
  const inStyle = (name: string) => style.size === 0 || style.has(cardKey(name));
  const leanOf = (name: string) => style.get(cardKey(name))?.lean ?? 0;
  const candidates = input.candidates
    .filter((c) => fitsIdentity(c.card, identity))
    .map((c) => {
      const owned = c.ownedCopies > 0;
      if (style.size === 0) return { ...c, owned };
      const played = style.get(cardKey(c.card.name));
      return {
        ...c,
        owned,
        synergy: played ? (played.synergy ?? c.synergy) : undefined,
        inclusion: played ? (played.inclusion ?? c.inclusion) : undefined,
        lists: played?.lists?.length ? played.lists : c.lists,
      };
    });
  const byName = new Map(candidates.map((c) => [cardKey(c.card.name), c]));
  // The plan: the high-synergy cards of the commander's decks, or of the chosen playstyle's.
  const isPlanCandidate = (c: Candidate) =>
    (c.synergy ?? 0) >= PLAN_SYNERGY || leanOf(c.card.name) >= LEANS_IN || (style.size === 0 && (byName.get(cardKey(c.card.name))?.lists.some((l) => l === "High Lift Cards" || l === "High Synergy Cards") ?? false));
  const profile = deckProfile(deck, {
    commander: input.commander,
    isPlan: (name) => {
      const c = byName.get(cardKey(name));
      return c ? isPlanCandidate(c) : (style.get(cardKey(name))?.synergy ?? 0) >= PLAN_SYNERGY || leanOf(name) >= LEANS_IN;
    },
  });
  const manaBase = manaBasePlan(identity.length, input.lands ?? profile.curve.lands.count);
  const inDeck = new Set(deck.map((d) => cardKey(d.card.name)));
  const has = (name: string) => inDeck.has(cardKey(name));
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
    isPlan: isPlanCandidate,
    curve: profile.curve,
    perGroup,
    // Everything EDHREC lists is on offer, whether or not it fills a category.
    alwaysOffer: (c: Candidate) => c.inclusion !== undefined || (byName.get(cardKey(c.card.name))?.lists.length ?? 0) > 0,
  };
  const asPick = (p: Pick): BuilderPick => {
    const c = byName.get(cardKey(p.card.name));
    return { ...p, ownedCopies: c?.ownedCopies ?? 0, lists: c?.lists ?? [] };
  };
  const plan = planUpgrades(profile, candidates, has, options);
  const gaps = categoryGaps(profile);
  const score = (c: BuilderCandidate) => asPick(scoreCandidate(c, gaps, options));
  const ownedFirst = (a: BuilderPick, b: BuilderPick) => Number(b.ownedCopies > 0) - Number(a.ownedCopies > 0) || b.score - a.score;

  // Combos a card away that the bracket allows, EDHREC's for the commander first
  // and ones whose missing piece suits the playstyle ahead of the rest.
  const missingPiece = (combo: Combo) => combo.cards.find((n) => !has(n));
  const pieceInStyle = (combo: Combo) => Number(inStyle(missingPiece(combo) ?? ""));
  const combosGroup: BuilderGroups["combos"] = [];
  const comboReason = new Map<string, string>();
  for (const combo of [...(combos?.almostIncluded ?? [])].sort(byImpact).sort((a, b) => pieceInStyle(b) - pieceInStyle(a))) {
    if (comboBracket(combo) > comboLimit) continue;
    const piece = missingPiece(combo);
    const candidate = piece ? byName.get(cardKey(piece)) : undefined;
    if (!candidate || combosGroup.some((g) => cardKey(g.pick.card.name) === cardKey(piece!))) continue;
    const reason = `Completes ${combo.results[0] ?? "a combo"}`;
    combosGroup.push({ pick: { ...score(candidate), reason }, combo });
    comboReason.set(cardKey(piece!), reason);
    if (combosGroup.length >= perGroup) break;
  }

  // Lands beyond the basics, rated for the commander's colors: untapped fixing
  // up in more colors, utility lands up in fewer, always-tapped lands down.
  // A fetch land has no colors of its own, so it has to find the deck's.
  const rated = candidates
    .filter((c) => isLand(c.card) && !has(c.card.name) && !/\bBasic\b/.test(c.card.typeLine) && !(bracket <= 3 && isMassLandDenial(c.card)))
    .flatMap((c) => {
      const kind = landKind(c.card) ?? "other";
      if (kind === "fetch" && fetchedColors(c.card, identity).length < Math.min(2, identity.length)) return [];
      const pick = {
        ...score(c),
        score: (c.inclusion ?? 0) + Math.max(0, c.synergy ?? 0) + landFit(kind, identity.length),
        reason: LAND_KIND_LABEL[kind],
      };
      return [{ kind, pick }];
    })
    .sort((a, b) => Number(inStyle(b.pick.card.name)) - Number(inStyle(a.pick.card.name)) || (preferOwned ? ownedFirst(a.pick, b.pick) : b.pick.score - a.pick.score));
  const lands: LandShelf = { duals: [], fixing: [], utility: [], slow: [] };
  for (const { kind, pick } of rated) {
    const shelf = kind === "dual" ? lands.duals : kind === "tapped" ? lands.slow : fixesColors(kind) && identity.length >= 2 ? lands.fixing : lands.utility;
    // Everything EDHREC lists, and enough others to fill the mana base, so a big gap in many colors isn't cut short.
    if (pick.inclusion !== undefined || shelf.length < (shelf === lands.duals ? Math.max(perGroup, manaBase.nonbasics - profile.lands) : perGroup)) shelf.push(pick);
  }

  // Each shelf with everything that fills its category. Your own cards lead each part of it when you build from the binder.
  const labelled = (p: Pick, label?: (p: Pick) => string | undefined): BuilderPick => ({ ...asPick(p), reason: comboReason.get(cardKey(p.card.name)) ?? label?.(p) });
  const leanLabel = (p: Pick) => {
    const styles = style.get(cardKey(p.card.name))?.styles;
    return styles ? `For ${styles.join(" + ")}` : `+${Math.round(leanOf(p.card.name) * 100)}% in this playstyle`;
  };
  const statsLabel = (p: Pick) => {
    const parts = [];
    if (p.inclusion !== undefined) parts.push(`${Math.round(p.inclusion * 100)}% of decks`);
    if (p.synergy !== undefined) parts.push(`${p.synergy >= 0 ? "+" : ""}${Math.round(p.synergy * 100)}% synergy`);
    return parts.join(" · ") || undefined;
  };
  const arrange = (picks: Pick[], label?: (p: Pick) => string | undefined) => {
    const out = picks.map((p) => labelled(p, label));
    return preferOwned ? out.sort((a, b) => Number(b.ownedCopies > 0) - Number(a.ownedCopies > 0)) : out;
  };
  const template = CATEGORIES.map((category): TemplateShelf => {
    // Tutors and Game Changers that fill no category go toward the plan, as does anything else EDHREC lists.
    const fits = plan.eligible.filter((p) => p.categories.includes(category) || (category === "plan" && p.categories.length === 0));
    const played = fits.filter((p) => inStyle(p.card.name));
    const outside = fits.filter((p) => !inStyle(p.card.name));
    const leaning = played.filter((p) => leanOf(p.card.name) >= LEANS_IN).sort((a, b) => leanOf(b.card.name) - leanOf(a.card.name) || b.score - a.score);
    const others = played.filter((p) => !leaning.includes(p)).sort((a, b) => (b.synergy ?? -1) - (a.synergy ?? -1) || b.score - a.score);
    const listed = arrange(others, statsLabel);
    return {
      category,
      short: gaps[category] ?? 0,
      leaning: arrange(leaning, leanLabel),
      lists: EDHREC_LISTS.map((title) => ({ title, picks: listed.filter((p) => listFor(p) === title) })).filter((list) => list.picks.length > 0),
      outside: arrange(outside),
      all: {
        leaning: leaning.map((p) => labelled(p, leanLabel)),
        synergy: others.filter((p) => (p.synergy ?? 0) > 0).map((p) => labelled(p, statsLabel)),
        rest: [...others.filter((p) => (p.synergy ?? 0) <= 0), ...outside].map((p) => labelled(p, statsLabel)),
      },
    };
  });

  // The plan's tab shows each card once: combo pieces already on its shelf stay there.
  const planShelf = template.find((g) => g.category === "plan")!;
  const shown = new Set([...planShelf.leaning, ...planShelf.lists.flatMap((l) => l.picks), ...planShelf.outside].map((p) => cardKey(p.card.name)));
  const combosLeft = combosGroup.filter((g) => !shown.has(cardKey(g.pick.card.name)));

  // The curve to aim for: the average deck's on EDHREC, for this deck's spells; failing that, a low, wide one.
  const spellTarget = 99 - manaBase.lands;
  const targets = input.curveCounts ? scaledCurve(input.curveCounts, spellTarget) : profile.curve.targets;
  const jobsOf = (name: string) => CATEGORIES.filter((c) => profile.categories[c].includes(name));
  const needed = (c: Category) => profile.categories[c].length <= CATEGORY_INFO[c].target;
  // What a card is worth to the deck: its synergy, how far it leans into the playstyle, and the jobs it does.
  const worth = (card: CardDetails) => {
    const jobs = jobsOf(card.name);
    return (byName.get(cardKey(card.name))?.synergy ?? 0) + leanOf(card.name) * 2 + jobs.length * 0.25 + (jobs.some(needed) ? 0.3 : 0);
  };
  const whyCut = (card: CardDetails) => {
    const jobs = jobsOf(card.name);
    if (jobs.length === 0) return "Fills no part of the template";
    if (!inStyle(card.name)) return "Outside your playstyle";
    const needs = jobs.find(needed);
    return needs ? `Keeps ${CATEGORY_INFO[needs].label} filled` : `${CATEGORY_INFO[jobs[0]].label} has plenty`;
  };
  const spells = deck.map((d) => d.card).filter((card) => !isLand(card) && cardKey(card.name) !== cardKey(input.commander ?? ""));
  const curveSlots = targets.map((target, slot): CurveSlot => ({
    slot,
    have: profile.curve.counts[slot],
    target,
    cards: spells
      .filter((card) => slotOf(card.cmc) === slot)
      .sort((a, b) => worth(a) - worth(b))
      .map((card) => ({ card, why: whyCut(card) })),
  }));

  return { template, combos: combosLeft, lands, leftOut: plan.leftOut, profile, manaBase, curveSlots };
}
