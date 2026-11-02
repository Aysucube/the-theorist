// Threats: anything that actively advances a win condition, pressures the
// table's resources or forces opponents to react, whether a card, a board state
// or something you do. Each card is sorted into one kind, the first that fits in
// the order below, so the most game-ending reading wins and the counts add up.
// Like the roles, these are heuristics read from rules text, not rules.
import type { CardDetails } from "@/lib/types";
import { cardRoles, rulesText } from "./roles";

export type ThreatKind = "combo" | "walker" | "alternate" | "tempo" | "drain" | "theft" | "swarm" | "overrun" | "stax" | "attrition" | "attackers" | "engine";

export type ThreatPurpose = "win" | "pressure" | "react";

export const THREAT_PURPOSES: { purpose: ThreatPurpose; label: string }[] = [
  { purpose: "win", label: "Advance a win condition" },
  { purpose: "pressure", label: "Pressure resources" },
  { purpose: "react", label: "Force a reaction" },
];

/** Every kind of threat, in the order a card is tested against them. */
export const THREAT_KINDS: { kind: ThreatKind; purpose: ThreatPurpose; label: string; about: string }[] = [
  { kind: "combo", purpose: "win", label: "Combos", about: "The pieces of combos you have, and the cards that would complete one, all within your bracket. A piece adds to your threats only if it’s a threat on its own." },
  { kind: "walker", purpose: "react", label: "Planeswalkers", about: "They get stronger every turn they stay, so the table has to attack them." },
  { kind: "alternate", purpose: "win", label: "Alternate wins", about: "Win outright, or with poison, without taking anyone to 0 life." },
  { kind: "tempo", purpose: "win", label: "Extra turns and combats", about: "More attacks and more of your own turns before anyone can answer." },
  { kind: "drain", purpose: "win", label: "Drain and burn", about: "Life loss that goes around blockers, often a little at a time." },
  { kind: "theft", purpose: "pressure", label: "Theft", about: "Take what opponents built and turn it on them." },
  { kind: "swarm", purpose: "win", label: "Swarms", about: "A wide board of tokens, built up turn after turn." },
  { kind: "overrun", purpose: "win", label: "Team pump", about: "Turn a board of creatures into lethal damage." },
  { kind: "stax", purpose: "pressure", label: "Stax and taxes", about: "Rules that slow the table down or make everything cost more." },
  { kind: "attrition", purpose: "pressure", label: "Attrition", about: "Strip away hands, libraries, lands and boards." },
  { kind: "attackers", purpose: "win", label: "Big attackers", about: "Creatures that end games in a few swings, too large or evasive to block." },
  { kind: "engine", purpose: "react", label: "Engines", about: "Permanents that pay you again and again until someone removes them." },
];

/** Roughly how many threats a deck runs when EDHREC can't say: two thirds of the template's 30 plan cards. */
export const THREAT_TARGET = 20;

const has = (t: string, ...patterns: RegExp[]) => patterns.some((p) => p.test(t));
const EVASION = new Set(["Flying", "Trample", "Menace", "Shadow", "Fear", "Intimidate", "Skulk", "Horsemanship", "Double strike"]);

/** Which kind of threat a card is, if any. `combo` says it's a piece of a combo. Lands aren't threats on their own. */
export function threatKind(card: CardDetails, combo = false): ThreatKind | undefined {
  const type = card.typeLine.split(" // ")[0];
  if (/\bLand\b/.test(type)) return undefined;
  if (combo) return "combo";
  if (/\bPlaneswalker\b/.test(type)) return "walker";
  const t = rulesText(card);
  const roles = cardRoles(card);
  if (has(t, /\byou win the game\b/, /(?<!can't )\bloses? the game\b/, /\bpoison counters?\b/, /\binfect\b/, /\btoxic\b/)) return "alternate";
  if (has(t, /\bextra (?:turn|combat)/, /\badditional combat (?:phase|step)/)) return "tempo";
  if (
    has(
      t,
      /\beach (?:opponent|player) loses\b/,
      /\btarget (?:player|opponent) loses (?:\d|x|that much)/,
      /\bcontroller loses \d/,
      /\bdamage to each opponent\b/,
      /\bdamage to (?:target player|target opponent|that player)\b/,
    )
  ) {
    return "drain";
  }
  if (
    has(
      t,
      /\b(?:gain|exchange) control of\b/,
      /\byou control enchanted\b/,
      /\bexile [^.]*\b(?:each opponent's|target opponent's|target player's|that player's) library\b[^.]*\byou may\b/,
      /\byou may (?:cast|play) [^.]*\b(?:an opponent|your opponents|opponents?) (?:owns?|controls?)\b/,
    )
  ) {
    return "theft";
  }
  if (
    has(
      t,
      /\bcreate (?!a |an |one )[^.]*creature tokens?/,
      /\bcreate a number of [^.]*creature tokens?/,
      /\bcreate [^.]*creature tokens? for each\b/,
      /(?:whenever|at the beginning of)[^.]*\bcreate [^.]*creature tokens?/,
      /\}[^:.]*: [^.]*\bcreate [^.]*creature tokens?/,
    )
  ) {
    return "swarm";
  }
  if (has(t, /\bcreatures you control (?:gain [^.]*and )?get \+/, /\bother [^.]*you control get \+/, /\bcreatures you control (?:gain|have) [^.]*\b(?:trample|double strike|flying)\b/)) return "overrun";
  if (roles.has("tax") || has(t, /\b(?:your opponents|opponents|each opponent|players) can't\b/, /\bspells? [^.]*cost \{\d\} more/, /\bdon't untap during/)) return "stax";
  if (has(t, /\b(?:each opponent|target player|target opponent|that player|defending player) (?:discards?|mills?|sacrifices?)\b/, /\bdestroy (?:target|all|each) (?:nonbasic )?lands?\b/)) return "attrition";
  if (/\bCreature\b/.test(type)) {
    const power = Number(card.power);
    if (power >= 6 || (power >= 4 && card.keywords.some((k) => EVASION.has(k)))) return "attackers";
  }
  if (
    !/\b(?:Instant|Sorcery)\b/.test(type) &&
    (roles.has("enhancer") ||
      has(
        t,
        /(?:whenever|at the beginning of)[^.]*\b(?:draws?|create|exile the top)\b/,
        /(?:whenever|at the beginning of)[^.]*\bput [^.]*onto the battlefield/,
        /(?:whenever|at the beginning of)[^.]*\breturn [^.]*(?:to|onto) the battlefield/,
        /\}(?:(?!sacrifice)[^:.])*: [^.]*\bdraws?\b/,
      ))
  ) {
    return "engine";
  }
  return undefined;
}
