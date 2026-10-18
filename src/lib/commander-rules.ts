// Which cards can lead a Commander deck.

export interface FrontFace {
  /** The front face's type line, e.g. "Legendary Artifact — Spacecraft". */
  typeLine: string;
  /** Printed power and toughness, if the front face has a P/T box ("6", "*", ...). */
  power?: string;
  toughness?: string;
  oracleText?: string;
}

/**
 * True when the card can be your commander:
 * - a legendary card with a power/toughness box on its front face. Since Edge
 *   of Eternities (2025) that's not just legendary creatures but also
 *   legendary Vehicles and Spacecraft, e.g. Hearthhull, the Worldseed;
 * - or a card whose text says it can be your commander (some planeswalkers).
 * Only the front face counts: a land that transforms into a legendary
 * creature can't lead a deck.
 */
export function canBeCommander(front: FrontFace): boolean {
  const legendary = /\bLegendary\b/.test(front.typeLine);
  const hasPowerToughness = Boolean(front.power && front.toughness);
  if (legendary && (/\bCreature\b/.test(front.typeLine) || hasPowerToughness)) return true;
  return /can be your commander/i.test(front.oracleText ?? "");
}
