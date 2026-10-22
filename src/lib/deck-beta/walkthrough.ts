// Deck Synergy: a combo as a step-by-step walkthrough, with the cards each
// step mentions, so the network can light them up as the steps go by.
import type { Combo } from "@/lib/types";

export interface WalkStep {
  title: string;
  text: string;
  /** The combo's cards this step is about, by the combo's spelling. */
  cards: string[];
}

/** Ways a card is written in step text: its full name, its front face, and its short name ("Atraxa"). */
function namesFor(card: string): string[] {
  const front = card.split(" // ")[0];
  const short = front.split(",")[0];
  return [...new Set([card, front, short].filter((n) => n.length >= 3))];
}

/** The combo's cards a piece of text mentions. */
export function cardsMentioned(text: string, cards: string[]): string[] {
  return cards.filter((card) => namesFor(card).some((name) => text.includes(name)));
}

/** Set up, then each step of the combo, then what it does. */
export function walkSteps(combo: Combo): WalkStep[] {
  const steps = combo.steps
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const setup = [
    `You need ${combo.cards.join(" + ")}${combo.templates.length > 0 ? `, plus ${combo.templates.map((t) => `any ${t}`).join(", ")}` : ""}.`,
    combo.prerequisites,
    combo.manaNeeded ? `Mana needed: ${combo.manaNeeded}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { title: "Set up", text: setup, cards: combo.cards },
    ...steps.map((text, i) => {
      const mentioned = cardsMentioned(text, combo.cards);
      return { title: `Step ${i + 1}`, text, cards: mentioned.length > 0 ? mentioned : combo.cards };
    }),
    { title: "Result", text: combo.results.join(" · ") || "The combo is done.", cards: combo.cards },
  ];
}

/**
 * Combos that matter most first: infinite ones and outright wins, then the
 * ones EDHREC lists for the commander (in its order), then the most played.
 */
export function byImpact(a: Combo, b: Combo): number {
  const impact = (c: Combo) => (c.results.some((r) => /infinite|win the game|each opponent loses/i.test(r)) ? 1 : 0);
  const listed = (c: Combo) => c.edhrecOrder ?? Infinity;
  return impact(b) - impact(a) || (listed(a) === listed(b) ? 0 : listed(a) < listed(b) ? -1 : 1) || (b.popularity ?? 0) - (a.popularity ?? 0);
}
