// Deck Synergy: which Commander Bracket a deck is in, how close it is to the
// next one, and what to change to reach a chosen bracket. Follows Wizards of
// the Coast's bracket rules (October 2025 update):
//   1 Exhibition: no Game Changers, mass land denial, extra turns or two-card combos
//   2 Core: no Game Changers, mass land denial, chained extra turns or two-card combos
//   3 Upgraded: up to 3 Game Changers; no mass land denial or chained extra
//     turns; two-card combos only late in the game (not before turn six)
//   4 Optimized and 5 cEDH: anything legal
// Tutors are no longer limited. Combos are rated by Commander Spellbook's
// bracket tags. A list can't show a deck's intent, so Bracket 1 (theme over
// winning) and Bracket 5 (built for a competitive table) are only suggested.
import type { CardDetails, Combo, DeckCombos, SpellbookBracket, SpellbookTag } from "@/lib/types";

export type Bracket = 1 | 2 | 3 | 4 | 5;
export const BRACKETS: Bracket[] = [1, 2, 3, 4, 5];

export const BRACKET_INFO: Record<Bracket, { name: string; rules: string; turns: string }> = {
  1: { name: "Exhibition", rules: "Theme over winning. No Game Changers, mass land denial, extra turns or two-card combos.", turns: "9+ turns" },
  2: { name: "Core", rules: "No Game Changers, mass land denial, chained extra turns or two-card combos.", turns: "8+ turns" },
  3: {
    name: "Upgraded",
    rules: "Up to 3 Game Changers. No mass land denial or chained extra turns; two-card combos only late in the game.",
    turns: "6+ turns",
  },
  4: { name: "Optimized", rules: "Anything legal: Game Changers, fast combos, land denial and extra turns.", turns: "4+ turns" },
  5: { name: "cEDH", rules: "Anything legal, built to win as fast as possible against a competitive table.", turns: "Any turn" },
};

/** How many Game Changers each bracket allows. */
export const MAX_GAME_CHANGERS: Record<Bracket, number> = { 1: 0, 2: 0, 3: 3, 4: Infinity, 5: Infinity };

// Commander Spellbook's combo tags, by the bracket its developers map them to.
const TAG_BRACKET: Record<SpellbookTag, Bracket | undefined> = { E: 1, C: 2, O: 2, P: 3, S: 3, R: 4, B: undefined };

export function tagBracket(tag: SpellbookTag | undefined): Bracket | undefined {
  return tag ? TAG_BRACKET[tag] : undefined;
}

const textOf = (card: Pick<CardDetails, "oracleText">) => card.oracleText.toLowerCase();

/** Destroys, locks down or changes the mana of many lands at once (Armageddon, Winter Orb, Blood Moon). */
export function isMassLandDenial(card: Pick<CardDetails, "oracleText">): boolean {
  const t = textOf(card);
  return [
    /\b(?:destroy|exile) all (?:[^.]*?\b)?(?:nonbasic )?lands\b(?! you control)/,
    /\breturn all (?:[^.]*?\b)?lands to their owners'/,
    /\beach player sacrifices (?:all|half|x|two|three|four|five|six|seven) [^.]*\blands?\b/,
    /\b(?:nonbasic )?lands don't untap during (?:their controllers'|its controller's) untap steps?/,
    /\bplayers can't untap more than (?:one|two) (?:lands?|permanents?)/,
    /\bnonbasic lands are (?:mountains|islands|swamps|plains|forests)\b/,
  ].some((p) => p.test(t));
}

export function isExtraTurn(card: Pick<CardDetails, "oracleText">): boolean {
  return /\btakes? (?:an|\w+) extra turns?\b/.test(textOf(card));
}

/** Wins the game, or makes something infinite. */
function endsGame(combo: Combo): boolean {
  return combo.results.some((r) => /infinite|win the game|loses? the game|each opponent loses/i.test(r));
}

/** Two cards (or one card plus the commander) with no other conditions. */
function isTwoCard(combo: Combo, spellbook?: SpellbookBracket | null): boolean {
  return (spellbook?.twoCard.includes(combo.id) ?? false) || (combo.cards.length <= 2 && combo.templates.length === 0);
}

/** The bracket a combo belongs in: Commander Spellbook's tag, and at least 3 for a two-card infinite or win. */
export function comboBracket(combo: Combo, spellbook?: SpellbookBracket | null): Bracket {
  const tagged = tagBracket(combo.bracketTag) ?? 2;
  return Math.max(tagged, isTwoCard(combo, spellbook) && endsGame(combo) ? 3 : 2) as Bracket;
}

export interface BracketInput {
  /** Every card in the deck, commander included. */
  cards: CardDetails[];
  isGameChanger: (name: string) => boolean;
  /** Undefined while Commander Spellbook hasn't answered, null if it couldn't be reached. */
  combos?: DeckCombos | null;
  spellbook?: SpellbookBracket | null;
  /** Tutors in the deck (see roles.ts). */
  tutors: number;
}

export interface RatedCombo {
  combo: Combo;
  bracket: Bracket;
  twoCard: boolean;
}

export interface BracketReport {
  bracket: Bracket;
  /** The next bracket, when the deck is close to it. */
  nearing?: Bracket;
  gameChangers: string[];
  massLandDenial: string[];
  extraTurns: string[];
  /** The deck's combos, highest bracket first. */
  combos: RatedCombo[];
  /** Combos one card away that would raise the bracket, with the card each needs. */
  almost: (RatedCombo & { missing: string })[];
  /** Combos that lock opponents out or chain extra turns (Bracket 4). */
  locks: Combo[];
  /** Why the deck is in its bracket, highest first. */
  reasons: { bracket: Bracket; text: string }[];
  /** Why it's close to the next bracket. */
  nearingReasons: string[];
  /** Commander Spellbook's own estimate for the whole deck. */
  spellbook?: Bracket;
  tutors: number;
}

const unique = (names: string[]) => [...new Set(names)];
/** "A, B and 3 more"; names with commas in them ("Mona Lisa, Science Geek") are split by semicolons instead. */
const listOf = (names: string[], max = 4) => {
  const sep = names.some((n) => n.includes(",")) ? "; " : ", ";
  return names.length <= max ? names.join(sep) : `${names.slice(0, max).join(sep)} and ${names.length - max} more`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const piecesOf = (combo: Combo, commander?: string) => combo.cards.filter((c) => c !== commander);
const describe = (combo: Combo) => `${combo.cards.join(" + ")} (${combo.results[0] ?? "combo"})`;

/** Tutors that make a deck play like the next bracket up. */
const MANY_TUTORS: Partial<Record<Bracket, number>> = { 2: 4, 3: 6, 4: 8 };

export function estimateDeckBracket({ cards, isGameChanger, combos, spellbook, tutors }: BracketInput): BracketReport {
  const names = cards.map((c) => c.name);
  const inDeck = new Set(names);
  const fromSpellbook = (list: string[] | undefined) => (list ?? []).filter((n) => inDeck.has(n));
  const gameChangers = unique([...names.filter(isGameChanger), ...fromSpellbook(spellbook?.gameChangers)]).sort();
  const massLandDenial = unique([...cards.filter(isMassLandDenial).map((c) => c.name), ...fromSpellbook(spellbook?.massLandDenial)]).sort();
  const extraTurns = unique([...cards.filter(isExtraTurn).map((c) => c.name), ...fromSpellbook(spellbook?.extraTurns)]).sort();

  const rated: RatedCombo[] = (combos?.included ?? [])
    .map((combo) => ({ combo, bracket: comboBracket(combo, spellbook), twoCard: isTwoCard(combo, spellbook) }))
    .sort((a, b) => b.bracket - a.bracket);
  const locks = (combos?.included ?? []).filter((c) => spellbook?.locks.includes(c.id));

  const reasons: { bracket: Bracket; text: string }[] = [];
  const gc = gameChangers.length;
  if (gc >= 4) reasons.push({ bracket: 4, text: `${gc} Game Changers (${listOf(gameChangers)}): more than the 3 Bracket 3 allows.` });
  else if (gc >= 1) reasons.push({ bracket: 3, text: `${plural(gc, "Game Changer")} (${listOf(gameChangers)}): Bracket 3 allows up to 3.` });
  if (massLandDenial.length > 0) {
    reasons.push({ bracket: 4, text: `Mass land denial (${listOf(massLandDenial)}): only Brackets 4 and 5 allow it.` });
  }
  if (extraTurns.length >= 3) {
    reasons.push({ bracket: 4, text: `${extraTurns.length} extra-turn cards (${listOf(extraTurns)}): enough to chain turns, which needs Bracket 4.` });
  }
  if (locks.length > 0) {
    reasons.push({ bracket: 4, text: `${plural(locks.length, "combo")} that lock opponents out or chain extra turns: ${listOf(locks.map(describe), 2)}.` });
  }
  for (const level of [4, 3] as Bracket[]) {
    const at = rated.filter((r) => r.bracket === level);
    if (at.length === 0) continue;
    const two = at.filter((r) => r.twoCard).length;
    const kind = two === at.length ? "two-card combo" : "combo";
    reasons.push({
      bracket: level,
      text: `${plural(at.length, kind)} Commander Spellbook puts in Bracket ${level}${level === 4 ? " (fast or game-winning)" : ""}: ${listOf(at.map((r) => describe(r.combo)), 2)}.`,
    });
  }
  const sb = tagBracket(spellbook?.tag);
  const floor = Math.max(2, ...reasons.map((r) => r.bracket)) as Bracket;
  if (sb && sb > floor) reasons.push({ bracket: sb, text: `Commander Spellbook's own estimate for the deck is Bracket ${sb}.` });
  reasons.sort((a, b) => b.bracket - a.bracket);
  const bracket = Math.max(floor, sb ?? 2) as Bracket;
  if (reasons.length === 0) {
    reasons.push({
      bracket: 2,
      text: combos === undefined ? "No Game Changers or mass land denial. Still checking its combos." : "No Game Changers, mass land denial, extra-turn chains or two-card combos.",
    });
  }

  // One card away from a combo above this bracket.
  const almost = (combos?.almostIncluded ?? [])
    .map((combo) => ({ combo, bracket: comboBracket(combo), twoCard: isTwoCard(combo), missing: combo.cards.find((n) => !inDeck.has(n)) ?? "" }))
    .filter((a) => a.missing && a.bracket > bracket)
    .sort((a, b) => b.bracket - a.bracket);

  const nearingReasons: string[] = [];
  let pressure = 0;
  if (bracket < 5) {
    const next = (bracket + 1) as Bracket;
    if (bracket === 4) {
      const fast = rated.filter((r) => r.bracket >= 4).length;
      if (gc >= 6 && tutors >= 6 && fast > 0) {
        pressure += 2;
        nearingReasons.push(`Built like a cEDH deck: ${gc} Game Changers, ${tutors} tutors and ${plural(fast, "fast combo")}.`);
      }
    } else {
      const missing = unique(almost.map((a) => a.missing));
      if (missing.length > 0) {
        pressure += missing.length >= 3 ? 2 : 1;
        nearingReasons.push(`One card from ${plural(almost.length, `Bracket ${next}+ combo`)}: ${listOf(missing, 3)}.`);
      }
      if (bracket === 3 && gc === 3) {
        pressure += 2;
        nearingReasons.push("At Bracket 3's limit of 3 Game Changers.");
      }
      if (bracket === 3) {
        const early = rated.filter((r) => r.bracket === 3 && r.twoCard && (r.combo.manaValueNeeded ?? 99) <= 6);
        if (early.length > 0) {
          pressure += 1;
          nearingReasons.push(`A cheap two-card combo that could come together before turn six: ${describe(early[0].combo)}.`);
        }
      }
      if (extraTurns.length > 0 && extraTurns.length < 3) {
        pressure += 1;
        nearingReasons.push(`${plural(extraTurns.length, "extra-turn card")} (${listOf(extraTurns)}): fine as long as you don't chain them.`);
      }
    }
    const many = MANY_TUTORS[bracket];
    if (many && tutors >= many) {
      pressure += 1;
      nearingReasons.push(`${tutors} tutors find your combo pieces and best cards often.`);
    }
    // Two small signs, or one big one.
    if (pressure < 2) nearingReasons.length = 0;
  }

  return {
    bracket,
    nearing: pressure >= 2 && bracket < 5 ? ((bracket + 1) as Bracket) : undefined,
    gameChangers,
    massLandDenial,
    extraTurns,
    combos: rated,
    almost,
    locks,
    reasons,
    nearingReasons,
    spellbook: sb,
    tutors,
  };
}

/** "Bracket 2 nearing 3" */
export function bracketLabel(report: Pick<BracketReport, "bracket" | "nearing">): string {
  return `Bracket ${report.bracket}${report.nearing ? ` nearing ${report.nearing}` : ""}`;
}

export interface CutGroup {
  why: string;
  /** Cut at least this many of `cards`. */
  cut: number;
  cards: string[];
}

export interface BracketPath {
  target: Bracket;
  /** What to take out for the deck to fit the target. Empty when it already fits. */
  cuts: CutGroup[];
  /** How many more Game Changers the target allows (Infinity for no limit). */
  gameChangerRoom: number;
  /** The highest-bracket combos the target allows. */
  comboLimit: Bracket;
  /** Mass land denial is allowed. */
  landDenial: boolean;
}

/** What it takes for the deck to fit a bracket: cuts if it's above, room to grow if it's below. */
export function bracketPath(report: BracketReport, target: Bracket, commander?: string): BracketPath {
  const cuts: CutGroup[] = [];
  const allowed = MAX_GAME_CHANGERS[target];
  const gc = report.gameChangers.length;
  if (gc > allowed) {
    cuts.push({
      why: allowed === 0 ? `Game Changers: Bracket ${target} allows none.` : `Game Changers: Bracket ${target} allows ${allowed}.`,
      cut: gc - allowed,
      cards: report.gameChangers,
    });
  }
  if (target <= 3 && report.massLandDenial.length > 0) {
    cuts.push({ why: `Mass land denial: Bracket ${target} allows none.`, cut: report.massLandDenial.length, cards: report.massLandDenial });
  }
  const turnsAllowed = target === 1 ? 0 : target <= 3 ? 2 : Infinity;
  if (report.extraTurns.length > turnsAllowed) {
    cuts.push({
      why: target === 1 ? "Extra turns: Bracket 1 allows none." : `Extra turns: keep ${turnsAllowed} at most, so they can't be chained.`,
      cut: report.extraTurns.length - turnsAllowed,
      cards: report.extraTurns,
    });
  }
  const comboLimit: Bracket = target <= 2 ? 2 : target === 3 ? 3 : 5;
  if (target <= 3) {
    const breaking = new Set<string>();
    for (const r of report.combos) {
      if (r.bracket <= comboLimit) continue;
      breaking.add(r.combo.id);
      cuts.push({ why: `Breaks ${describe(r.combo)}, a Bracket ${r.bracket} combo.`, cut: 1, cards: piecesOf(r.combo, commander) });
    }
    for (const lock of report.locks) {
      if (breaking.has(lock.id)) continue;
      cuts.push({ why: `Breaks ${describe(lock)}, which locks opponents out.`, cut: 1, cards: piecesOf(lock, commander) });
    }
    // A piece shared by several of those combos breaks them all at once.
    const comboCuts = cuts.filter((c) => c.why.startsWith("Breaks "));
    const shared = [...new Set(comboCuts.flatMap((c) => c.cards))]
      .map((name) => ({ name, count: comboCuts.filter((c) => c.cards.includes(name)).length }))
      .filter((s) => s.count >= 2)
      .sort((a, b) => b.count - a.count);
    if (shared.length > 0) {
      const at = cuts.indexOf(comboCuts[0]);
      cuts.splice(at, 0, ...shared.map((s) => ({ why: `Cutting ${s.name} breaks ${s.count} of the combos below at once.`, cut: 1, cards: [s.name] })));
    }
  }
  return { target, cuts, gameChangerRoom: Math.max(0, allowed - gc), comboLimit, landDenial: target >= 4 };
}
