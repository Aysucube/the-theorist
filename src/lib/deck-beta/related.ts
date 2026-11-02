// What a deck needs beside its cards: the tokens it makes, the emblems and game
// pieces its cards bring (the Monarch, a dungeon, the Ring), and the cards they
// meld with or transform into. Sorted out of what Scryfall links to each card.
// Pure, so it's easy to test.

/** Something Scryfall links to a card. "back" is a double-faced card's other side. */
export interface RelatedPart {
  id?: string;
  component: string;
  name: string;
  typeLine: string;
  imageUrl?: string;
  /** For a "back": how the card gets there. */
  transforms?: boolean;
}

/** How a token or emblem looks, which the link to it doesn't say. */
export interface RelatedLook {
  imageUrl?: string;
  text?: string;
  power?: string;
  toughness?: string;
}

export interface RelatedCard {
  name: string;
  typeLine: string;
  text?: string;
  /** Power and toughness, e.g. "1/1". */
  stats?: string;
  imageUrl?: string;
  /** The deck's cards that bring it. */
  from: string[];
}

export interface RelatedPair {
  from: string;
  to: string;
  how: "Melds with" | "Melds into" | "Transforms into" | "Other side";
  imageUrl?: string;
}

/** POST /api/deck-beta/related */
export interface DeckRelated {
  tokens: RelatedCard[];
  emblems: RelatedCard[];
  /** Cards that come with the game rather than the deck, such as The Monarch or a dungeon. */
  pieces: RelatedCard[];
  pairs: RelatedPair[];
}

/** Everything a deck's cards link to that needs its look fetched. */
export function partIds(parts: Record<string, RelatedPart[]>): string[] {
  return [...new Set(Object.values(parts).flatMap((list) => list.filter((p) => p.id && kindOf(p) !== undefined).map((p) => p.id!)))];
}

function kindOf(part: RelatedPart): "tokens" | "emblems" | "pieces" | undefined {
  if (/^Emblem\b/.test(part.typeLine)) return "emblems";
  if (part.component === "token") return "tokens";
  if (part.component !== "combo_piece" || /checklist/i.test(part.name)) return undefined;
  return /^(?:Card\b|Dungeon\b)/.test(part.typeLine) ? "pieces" : undefined;
}

/** Sorts what the deck's cards link to; tokens that look the same are one, with every card that makes them. */
export function sortRelated(parts: Record<string, RelatedPart[]>, looks: Record<string, RelatedLook>): DeckRelated {
  const groups = { tokens: new Map<string, RelatedCard>(), emblems: new Map<string, RelatedCard>(), pieces: new Map<string, RelatedCard>() };
  const pairs: RelatedPair[] = [];
  for (const [card, list] of Object.entries(parts)) {
    for (const part of list) {
      if (part.name === card) continue;
      if (part.component === "back") {
        pairs.push({ from: card, to: part.name, how: part.transforms ? "Transforms into" : "Other side", imageUrl: part.imageUrl });
        continue;
      }
      if (part.component === "meld_part" || part.component === "meld_result") {
        pairs.push({ from: card, to: part.name, how: part.component === "meld_part" ? "Melds with" : "Melds into", imageUrl: looks[part.id ?? ""]?.imageUrl });
        continue;
      }
      const kind = kindOf(part);
      if (!kind) continue;
      const look = part.id ? looks[part.id] : undefined;
      const stats = look?.power !== undefined ? `${look.power}/${look.toughness}` : undefined;
      const key = [part.name, part.typeLine, stats, look?.text].join("|");
      const seen = groups[kind].get(key);
      if (seen) {
        if (!seen.from.includes(card)) seen.from.push(card);
      } else {
        groups[kind].set(key, { name: part.name, typeLine: part.typeLine, text: look?.text, stats, imageUrl: look?.imageUrl, from: [card] });
      }
    }
  }
  const sorted = (group: Map<string, RelatedCard>) => [...group.values()].sort((a, b) => b.from.length - a.from.length || a.name.localeCompare(b.name));
  // Each half of a meld names the other and what they make: once is enough.
  const seenPairs = new Set<string>();
  const once = pairs.filter((pair) => {
    const key = pair.how === "Melds into" ? pair.to : [pair.from, pair.to].sort().join("|");
    if (seenPairs.has(key)) return false;
    seenPairs.add(key);
    return true;
  });
  return { tokens: sorted(groups.tokens), emblems: sorted(groups.emblems), pieces: sorted(groups.pieces), pairs: once };
}
