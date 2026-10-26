// A commander's game plan in words: what it does, what it rewards or makes,
// how players build it (EDHREC's most popular playstyles for it, its decks'
// curve and makeup), and what the 99 should focus on. A payoff commander
// wants a deck of enablers; an enabler wants payoffs; one that is both wants
// protecting. Written from the card's rules text and EDHREC's data, so it
// reads the same way the rest of the app does. Pure, so it's easy to test.
import type { CardDetails, EdhrecDeckAverages, EdhrecTheme } from "@/lib/types";
import { landTarget } from "./curve";
import { manaBasePlan } from "./lands";
import { cardRoles } from "./roles";
import { parseTypeLine, tagKind, tagLabel, type Tag, type Traits } from "./synergy";

export interface GamePlanInput {
  commander: CardDetails;
  /** The commander's traits, read like the deck's (synergy.ts). */
  traits: Traits;
  themes?: EdhrecTheme[];
  numDecks?: number;
  averages?: EdhrecDeckAverages;
  /** The average mana value of its decks' spells on EDHREC. */
  curveAverage?: number;
}

export type CommanderRole = "payoff" | "enabler" | "engine" | "value";

export interface GamePlan {
  commander: string;
  role: CommanderRole;
  /** The tag the plan centres on (e.g. "subtype:Elf"), if any. */
  focusTag?: Tag;
  /** What the commander does and wants, in a few sentences. */
  summary: string[];
  /** What the 99 should hold, as short lines. */
  focus: string[];
  /** Its most-built playstyles on EDHREC, with their share of its decks. */
  playstyles: { name: string; slug: string; decks: number; share: number }[];
  lands: { count: number; why: string };
}

const short = (name: string) => name.split(" // ")[0].split(",")[0].trim();

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** What a deck does to feed a tag, for "fill the 99 with cards that …". */
function feeds(tag: Tag): string {
  const value = tag.slice(tag.indexOf(":") + 1);
  if (tagKind(tag) === "subtype") return `are or make ${tagLabel(tag)}`;
  if (tagKind(tag) === "type") return `are ${tagLabel(tag).toLowerCase()}`;
  const theme: Record<string, string> = {
    tokens: "make tokens",
    counters: "put +1/+1 counters on things",
    sacrifice: "sacrifice creatures or make them die",
    lifegain: "gain life",
    draw: "draw cards",
    graveyard: "fill your graveyard",
    landfall: "put extra lands onto the battlefield",
    spells: "are cheap instants and sorceries",
    blink: "have strong enter-the-battlefield effects, or blink them",
  };
  return theme[value] ?? `feed ${tagLabel(tag)}`;
}

/** EDHREC's theme for a tag, matched by name ("Elves" ↔ subtype:Elf, "Aristocrats" ↔ theme:sacrifice). */
function themeFor(tag: Tag, themes: EdhrecTheme[]): EdhrecTheme | undefined {
  const label = tagLabel(tag).toLowerCase();
  const first = label.split(/[\s(]/)[0];
  return themes.find((t) => {
    const name = t.name.toLowerCase();
    return name === label || name.split(/[\s(]/)[0] === first;
  });
}

const BROAD = new Set(["type:Creature", "type:Legendary", "type:Land"]);
const INCIDENTAL = new Set(["theme:lifegain", "theme:draw"]);

export function commanderGamePlan(input: GamePlanInput): GamePlan {
  const { commander, traits, themes = [], numDecks = 0, averages, curveAverage } = input;
  const name = short(commander.name);
  const { types, subtypes } = parseTypeLine(commander.typeLine);
  // What it is itself doesn't count as making: Lathril being an Elf isn't "making Elves".
  const own = new Set([...[...types].map((t) => `type:${t}`), ...[...subtypes].map((s) => `subtype:${s}`)]);
  const cares = [...traits.cares].filter((t) => !BROAD.has(t));
  // Gaining a little life or drawing a card on the side isn't a plan, unless EDHREC's decks build around it.
  const makes = [...traits.is].filter((t) => !BROAD.has(t) && !own.has(t) && (!INCIDENTAL.has(t) || themeFor(t, themes)));

  // The focus: what it rewards (or makes), preferring what EDHREC's decks build around.
  const ranked = (tags: Tag[]) =>
    [...tags].sort((a, b) => (themeFor(b, themes)?.numDecks ?? 0) - (themeFor(a, themes)?.numDecks ?? 0) || Number(tagKind(b) === "subtype") - Number(tagKind(a) === "subtype"));
  const role: CommanderRole = cares.length && makes.length ? "engine" : cares.length ? "payoff" : makes.length ? "enabler" : "value";
  const focusTag = role === "enabler" ? ranked(makes)[0] : role === "value" ? undefined : ranked(cares)[0];

  const roles = cardRoles(commander);
  const does: string[] = [];
  if (roles.has("draw")) does.push("draws you cards");
  if (roles.has("ramp")) does.push("ramps your mana");
  if (roles.has("removal") || roles.has("counter")) does.push("answers threats");
  if (roles.has("protection")) does.push("protects your board");
  const finisher = roles.has("finisher");
  const evasive = commander.keywords.filter((k) => ["Flying", "Menace", "Trample", "Haste", "Deathtouch", "Lifelink", "Double strike", "First strike"].includes(k));

  const summary: string[] = [];
  const caresLabels = ranked(cares).slice(0, 3).map(tagLabel);
  const makesLabels = ranked(makes).slice(0, 2).map(tagLabel);
  const extras = [...does, ...(finisher ? ["can close out the game itself"] : [])];
  const tail = extras.length ? `, and it ${list(extras)}` : "";
  if (role === "payoff") summary.push(`${name} rewards ${list(caresLabels)}${tail}.`);
  else if (role === "enabler") summary.push(`${name} makes ${list(makesLabels)}${tail}.`);
  else if (role === "engine") summary.push(`${name} both makes and rewards ${list(caresLabels)}${makesLabels.length ? ` (it makes ${list(makesLabels)})` : ""}${tail}.`);
  else summary.push(`${name} has no single theme of its own${extras.length ? `: it ${list(extras)}` : ""}.`);
  if (evasive.length && types.has("Creature")) summary.push(`It can pressure opponents in combat itself (${list(evasive.map((k) => k.toLowerCase()))}).`);

  // How players build it.
  const playstyles = themes.slice(0, 3).map((t) => ({ name: t.name, slug: t.slug, decks: t.numDecks, share: numDecks ? t.numDecks / numDecks : 0 }));
  if (playstyles.length && numDecks) {
    const [first, second] = playstyles;
    summary.push(
      `Of its ${numDecks.toLocaleString("en-PH")} decks on EDHREC, the most popular playstyle is ${first.name} (${Math.round(first.share * 100)}%)` +
        (second ? `, then ${second.name} (${Math.round(second.share * 100)}%).` : "."),
    );
  }

  // What the 99 should do about it.
  if (role === "payoff" && focusTag) {
    summary.push(`As a payoff, it wants the 99 full of enablers: cards that ${feeds(focusTag)}, the cheap ones first, so it pays off from the early turns.`);
  } else if (role === "enabler" && focusTag) {
    summary.push(`As an enabler it does the work itself, so fill the 99 with payoffs that reward ${tagLabel(focusTag)}, and protection to keep it alive.`);
  } else if (role === "engine" && focusTag) {
    summary.push(`It's engine and payoff in one: build around protecting it and adding more ${tagLabel(focusTag)}.`);
  } else {
    summary.push("Without one theme, it suits a deck led by the template: flexible cards, strong interaction and a low curve.");
  }
  if (commander.cmc >= 6) summary.push(`At ${commander.cmc} mana it arrives late, so cheap ramp is the priority to cast it on time.`);
  else if (commander.cmc <= 2) summary.push(`At ${commander.cmc} mana it comes down early and is easy to recast.`);

  const lands = landTarget(curveAverage);
  const focus: string[] = [];
  focus.push(
    focusTag
      ? `Plan: about 30 cards for ${tagLabel(focusTag)}, ${role === "payoff" ? "mostly enablers" : role === "enabler" ? "mostly payoffs" : "enablers, payoffs and enhancers"}.`
      : "Plan: about 30 cards for whatever wins the game, ideally ones that also fill a template job.",
  );
  if (averages) focus.push(`Its decks on EDHREC run about ${Math.round(averages.creatures)} creatures and ${Math.round(averages.instants + averages.sorceries)} instants and sorceries.`);
  focus.push(curveAverage ? `Curve: its decks average ${curveAverage.toFixed(1)} mana a spell, so ${lands.count} lands.` : `Lands: ${lands.count} to start, fewer if the curve ends up low.`);
  focus.push(`Ramp: 10 to 12, two mana or less first${commander.cmc >= 5 ? `, to cast a ${commander.cmc}-mana commander on time` : ""}. Card advantage: 12. Targeted disruption: 12. Mass disruption: 6.`);
  focus.push(manaBasePlan(commander.colorIdentity.length, lands.count).advice);

  return { commander: commander.name, role, focusTag, summary, focus, playstyles, lands };
}

/** How a deck lines up with its commander's plan: the plan's cards in it, as enablers and payoffs. */
export function planInDeck(plan: GamePlan, traits: Map<string, Traits>): { enablers: string[]; payoffs: string[] } | undefined {
  const tag = plan.focusTag;
  if (!tag) return undefined;
  const enablers: string[] = [];
  const payoffs: string[] = [];
  for (const [name, t] of traits) {
    if (name === plan.commander) continue;
    if (t.cares.has(tag)) payoffs.push(name);
    else if (t.is.has(tag)) enablers.push(name);
  }
  return { enablers: enablers.sort(), payoffs: payoffs.sort() };
}
