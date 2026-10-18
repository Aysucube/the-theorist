// Deck beta: works out which cards in a deck work together, from their type
// lines and rules text. These are heuristics, not a rules engine: a card's text
// is searched for the card types, subtypes and themes it rewards ("Elf
// creatures you control", "whenever you gain life"), which are matched
// against what the other cards are or make. Theme names follow EDHREC's.
import type { CardDetails } from "@/lib/types";

/** "type:Creature", "subtype:Elf" or "theme:tokens". */
export type Tag = string;
export type TagKind = "type" | "subtype" | "theme";

export interface Traits {
  /** What the card is, or makes: its types and subtypes, tokens it creates, themes it feeds. */
  is: Set<Tag>;
  /** What its text rewards. */
  cares: Set<Tag>;
}

// --- Tags -------------------------------------------------------------------

const TYPES: Record<string, { label: string; words: [string, string] }> = {
  Creature: { label: "Creatures", words: ["creature", "creatures"] },
  Artifact: { label: "Artifacts", words: ["artifact", "artifacts"] },
  Enchantment: { label: "Enchantments", words: ["enchantment", "enchantments"] },
  Land: { label: "Lands", words: ["land", "lands"] },
  Instant: { label: "Instants", words: ["instant", "instants"] },
  Sorcery: { label: "Sorceries", words: ["sorcery", "sorceries"] },
  Planeswalker: { label: "Planeswalkers", words: ["planeswalker", "planeswalkers"] },
  Battle: { label: "Battles", words: ["battle", "battles"] },
  Legendary: { label: "Legendary cards", words: ["legendary", "legendary"] },
};

/** Artifact tokens that cards make by name ("create a Treasure token"). */
const ARTIFACT_TOKENS = ["Treasure", "Food", "Clue", "Blood", "Gold", "Powerstone", "Map", "Incubator", "Junk"];

interface Theme {
  label: string;
  /** Text that rewards the theme. Matched first, then removed before `is` is tried. */
  cares?: RegExp;
  /** Text that feeds the theme. */
  is?: RegExp;
  caresKeywords?: string[];
  isKeywords?: string[];
  /** Other tags a card caring about this theme also cares about (landfall wants lands). */
  alsoCares?: Tag[];
}

const THEMES: Record<string, Theme> = {
  counters: {
    label: "+1/+1 Counters",
    cares:
      /\+1\/\+1 counters? (?:is|are) put|\b(?:creatures?|permanents?|each|other)(?: you control)? with (?:a|one or more) \+1\/\+1 counters? on (?:it|them)|\bhas (?:a|one or more) \+1\/\+1 counters? on it|for each \+1\/\+1 counter|number of \+1\/\+1 counters|would put one or more (?:\+1\/\+1 )?counters|\bproliferate\b/g,
    is: /\bput (?:a|an|one|two|three|four|five|x|that many|\w+) \+1\/\+1 counters?|\bput [^.]*?\+1\/\+1 counters? on|enters(?: the battlefield)? with [^.]*?\+1\/\+1 counters?|\bproliferate\b/,
    isKeywords: ["Bolster", "Evolve", "Modular", "Adapt", "Outlast", "Training", "Mentor", "Support", "Graft", "Riot", "Backup", "Reinforce", "Proliferate"],
    caresKeywords: ["Proliferate"],
  },
  tokens: {
    label: "Tokens",
    cares:
      /tokens? you control|whenever (?:a|an|one or more|another) [^.]*?tokens? (?:enters?|you control)|would create (?:a|one or more) [^.]*?tokens?|creates? twice that many|for each [^.]*?token you control|\bpopulate\b/g,
    is: /\bcreates? [^.]*?\btokens?\b|\b(?:amass|fabricate|investigate|incubate)\b/,
    isKeywords: ["Amass", "Fabricate", "Investigate", "Populate", "Afterlife", "Incubate", "Myriad", "Embalm", "Eternalize", "Encore"],
  },
  sacrifice: {
    label: "Aristocrats (sacrifice & dies)",
    cares:
      /whenever (?!cardname dies)(?:a|an|another|one or more|cardname or another)? ?[^.]*?\bdies\b|whenever you sacrifice|dying causes|is put into (?:a|your) graveyard from the battlefield/g,
    is: /(?:^|\n|: |, |\. |may )sacrifice (?:a|an|another|one or more|any number of|x|two|three) /,
  },
  lifegain: {
    label: "Lifegain",
    cares:
      /whenever you gain life|if you would gain life|you(?:'ve| have) gained (?:\d+ or more )?life|gained life this turn|(?:amount of )?life you(?:'ve)? gained/g,
    is: /\byou gain (?:\d+|x|that much|an amount of) life|\bgains? \d+ life\b|\blifelink\b/,
    isKeywords: ["Lifelink"],
  },
  draw: {
    label: "Card Draw",
    cares: /whenever you draw (?:a|your|one or more)|draw your second card|cards? (?:you've )?drawn this turn/g,
    // "draw", not "draws": "each opponent draws a card" feeds someone else.
    is: /\bdraw (?:a|an|one|two|three|four|five|six|seven|x|that many) (?:additional )?cards?\b|\bdraw cards equal\b/,
  },
  graveyard: {
    label: "Graveyard",
    cares:
      /(?:from|in) your graveyard|from a graveyard|cards? in (?:all )?graveyards|\b(?:flashback|escape|unearth|delve|embalm|eternalize|jump-start|retrace|disturb|threshold|delirium|undergrowth)\b/g,
    is: /\bmills?\b|\bsurveil\b|\bdiscard (?:a|two|three|x|your|any number|up to)|\bput [^.]*? into your graveyard|\bdredge\b/,
    isKeywords: ["Mill", "Surveil", "Dredge"],
    caresKeywords: ["Flashback", "Escape", "Unearth", "Delve", "Embalm", "Eternalize", "Jump-start", "Retrace", "Disturb", "Threshold", "Delirium", "Undergrowth"],
  },
  landfall: {
    label: "Landfall",
    cares: /\blandfall\b|whenever (?:a|one or more) lands? (?:you control )?enters?/g,
    is: /search your library for [^.]*?\b(?:lands?|forest|island|swamp|mountain|plains)\b[^.]*?(?:onto the battlefield|into your hand)|put (?:a|up to \w+|x|any number of) land cards? [^.]*?onto the battlefield|play (?:an )?additional lands?/,
    caresKeywords: ["Landfall"],
    alsoCares: ["type:Land"],
  },
  spells: {
    label: "Spellslinger (noncreature spells)",
    cares: /noncreature spells?|\bprowess\b/g,
    caresKeywords: ["Prowess"],
  },
  blink: {
    label: "Blink (enter the battlefield)",
    cares:
      /exile (?:up to (?:one|two) |another |any number of )?(?:other )?target [^.]*?you (?:control|own)[^.]*?return|exile [^.]*?then return (?:it|that card|them|those cards)|entering(?: the battlefield)? causes a triggered ability/g,
    is: /\bwhen(?:ever)? (?:cardname|this (?:creature|artifact|enchantment|permanent)) enters\b/,
  },
};

export function tagKind(tag: Tag): TagKind {
  return tag.slice(0, tag.indexOf(":")) as TagKind;
}

export function tagLabel(tag: Tag): string {
  const value = tag.slice(tag.indexOf(":") + 1);
  switch (tagKind(tag)) {
    case "type":
      return TYPES[value]?.label ?? value;
    case "subtype":
      return pluralOf(value);
    default:
      return THEMES[value]?.label ?? value;
  }
}

// --- Subtypes ---------------------------------------------------------------

const IRREGULAR_PLURALS: Record<string, string> = {
  Elf: "Elves",
  Dwarf: "Dwarves",
  Wolf: "Wolves",
  Werewolf: "Werewolves",
  Thief: "Thieves",
  Fungus: "Fungi",
  Homunculus: "Homunculi",
  Mouse: "Mice",
  Ox: "Oxen",
  Cyclops: "Cyclopes",
};
const SAME_PLURAL = new Set(["Merfolk", "Treefolk", "Kithkin", "Kor", "Samurai", "Djinn", "Sheep", "Fish", "Elk", "Moose", "Vedalken", "Food", "Gold", "Junk", "Equipment"]);

export function pluralOf(subtype: string): string {
  if (IRREGULAR_PLURALS[subtype]) return IRREGULAR_PLURALS[subtype];
  if (SAME_PLURAL.has(subtype)) return subtype;
  if (/[^aeiou]y$/.test(subtype)) return `${subtype.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(subtype)) return `${subtype}es`;
  return `${subtype}s`;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Creature types that cards often make as tokens, so "Plant creatures you control" reads as Plants. */
const TOKEN_CREATURE_TYPES = ["Plant", "Saproling", "Spirit", "Zombie", "Soldier", "Goblin", "Insect", "Beast", "Thopter", "Servo", "Squirrel", "Rat", "Bird", "Cat", "Wolf", "Dragon", "Angel", "Demon", "Human", "Knight", "Vampire", "Elemental", "Snake", "Illusion", "Germ", "Golem", "Construct", "Faerie", "Eldrazi", "Scion", "Spawn", "Warrior", "Elf", "Treefolk"];

/** The subtypes the deck's cards can be checked for: every subtype on their type lines, plus common tokens. */
export function subtypeVocabulary(cards: CardDetails[]): string[] {
  const all = new Set([...ARTIFACT_TOKENS, ...TOKEN_CREATURE_TYPES]);
  for (const card of cards) for (const s of parseTypeLine(card.typeLine).subtypes) all.add(s);
  return [...all];
}

const subtypePatterns = new Map<string, RegExp>();
function subtypePattern(subtype: string): RegExp {
  let pattern = subtypePatterns.get(subtype);
  if (!pattern) {
    const forms = [...new Set([subtype, pluralOf(subtype)])].map(escapeRegExp).join("|");
    // Capitalized and whole-word: "Elf" and "Elves", not "elf" inside "itself".
    pattern = new RegExp(`(?<![\\w-])(?:${forms})(?![\\w-])`);
    subtypePatterns.set(subtype, pattern);
  }
  return pattern;
}

// --- Reading a card ---------------------------------------------------------

export function parseTypeLine(typeLine: string) {
  const types = new Set<string>();
  const subtypes = new Set<string>();
  for (const face of typeLine.split(" // ")) {
    const [left, right = ""] = face.split(/\s+[—-]\s+/);
    for (const word of left.split(/\s+/)) if (TYPES[word]) types.add(word);
    for (const word of right.split(/\s+/)) if (word) subtypes.add(word);
  }
  return { types, subtypes };
}

/** The card's own names in its text ("Atraxa" for "Atraxa, Praetors' Voice") become "CARDNAME". */
function withoutOwnName(card: CardDetails): string {
  const names = new Set<string>();
  for (const face of card.name.split(" // ")) {
    names.add(face);
    if (face.includes(",")) names.add(face.split(",")[0]);
  }
  let text = card.oracleText.replace(/\([^)]*\)/g, ""); // reminder text
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    text = text.split(name).join("CARDNAME");
  }
  return text;
}

/** Words in a sentence that say it's about your own cards, not an opponent's. */
const YOURS = /you control|your control|you cast|you own|your (?:graveyard|hand|library)|\banother\b|\bother\b|\bsacrifice\b|for each|\bwhenever\b|\bspells?\b|you may (?:cast|play)|\bhistoric\b/;
/** Words that make it removal or something aimed at opponents. */
const AIMED_ELSEWHERE = /opponent|\bdestroy|target player|counter target|exile target|deals? (?:\d+|x) damage to|\bcan't\b|each player|all creatures|tap target|gets? -\d|gets? -x|owner's hand|you don't control/;

/** What a card is and what its text rewards. `vocabulary` lists the subtypes to look for. */
export function cardTraits(card: CardDetails, vocabulary: string[]): Traits {
  const is = new Set<Tag>();
  const cares = new Set<Tag>();
  const { types, subtypes } = parseTypeLine(card.typeLine);
  for (const t of types) is.add(`type:${t}`);
  for (const s of subtypes) is.add(`subtype:${s}`);

  const text = withoutOwnName(card);

  // Tokens it creates count as things it makes ("a 1/1 green Elf Warrior creature token", "a Treasure token").
  // ("would create ... tokens" and "creates twice that many" are token doublers, not token makers.)
  const tokenPhrases = text.match(/(?<!would )\bcreates? (?!twice)[^.]*?\btokens?\b/gi) ?? [];
  for (const phrase of tokenPhrases) {
    for (const [type, { words }] of Object.entries(TYPES)) {
      if (type !== "Legendary" && new RegExp(`\\b${words[0]}\\b`, "i").test(phrase)) is.add(`type:${type}`);
    }
    for (const s of vocabulary) if (subtypePattern(s).test(phrase)) is.add(`subtype:${s}`);
    for (const t of ARTIFACT_TOKENS) if (subtypePattern(t).test(phrase)) is.add("type:Artifact");
  }
  // What's left is checked for what the card rewards.
  let rest = text;
  for (const phrase of tokenPhrases) rest = rest.replace(phrase, " ");

  for (const s of vocabulary) if (subtypePattern(s).test(rest)) cares.add(`subtype:${s}`);
  const subtypeWords = new Set(vocabulary.map((s) => s.toLowerCase()));

  for (const sentence of rest.toLowerCase().split(/[.\n]+/)) {
    if (!YOURS.test(sentence) || AIMED_ELSEWHERE.test(sentence)) continue;
    for (const [type, { words }] of Object.entries(TYPES)) {
      for (const match of sentence.matchAll(new RegExp(`\\b(?:${words[0]}|${words[1]})\\b`, "g"))) {
        // "Elf creatures you control" rewards Elves, not creatures in general.
        const before = sentence.slice(0, match.index).trim().split(/\s+/).pop() ?? "";
        if (!subtypeWords.has(before.replace(/^non-?/, ""))) cares.add(`type:${type}`);
      }
    }
    if (/\bhistoric\b/.test(sentence)) {
      cares.add("type:Legendary").add("type:Artifact").add("subtype:Saga");
    }
  }

  const lower = text.toLowerCase();
  const keywords = new Set(card.keywords);
  for (const [id, theme] of Object.entries(THEMES)) {
    // search() ignores the /g flag's lastIndex; replace() uses /g to drop every match.
    if ((theme.cares && lower.search(theme.cares) !== -1) || theme.caresKeywords?.some((k) => keywords.has(k))) {
      cares.add(`theme:${id}`);
      for (const tag of theme.alsoCares ?? []) cares.add(tag);
    }
    // "Whenever you draw a card" rewards drawing; it doesn't draw. Check what's left.
    const unclaimed = theme.cares ? lower.replace(theme.cares, " ") : lower;
    if ((theme.is && theme.is.test(unclaimed)) || theme.isKeywords?.some((k) => keywords.has(k))) is.add(`theme:${id}`);
  }
  if (tokenPhrases.length > 0) is.add("theme:tokens");
  // Every noncreature spell triggers prowess and "noncreature spell" payoffs.
  if (!types.has("Creature") && !types.has("Land")) is.add("theme:spells");
  // Choosing a creature type ("Herald's Horn") is left to the deck, which knows its main type.
  if (/choose a creature type/i.test(text)) cares.add("theme:chosen-type");

  return { is, cares };
}

// --- A whole deck -----------------------------------------------------------

export interface TagLinks {
  tag: Tag;
  /** Deck card names, alphabetical. */
  cards: string[];
}

export interface CardInteractions {
  /** What this card rewards, with the deck's cards that are or make it. */
  uses: TagLinks[];
  /** What this card is or makes, with the deck's cards that reward it. */
  usedBy: TagLinks[];
}

export interface DeckAnalysis {
  /** Keyed by Scryfall's card name. */
  traits: Map<string, Traits>;
  /** The subtypes looked for, for reading cards outside the deck the same way. */
  vocabulary: string[];
  /** The creature type the deck has most of, for "choose a creature type" cards. */
  mainCreatureType?: string;
  colors: string[];
}

const COLOR_ORDER = ["W", "U", "B", "R", "G"];

/** Every color in the deck's cards' color identities, in WUBRG order. */
export function deckColors(cards: CardDetails[]): string[] {
  const colors = new Set(cards.flatMap((c) => c.colorIdentity));
  return COLOR_ORDER.filter((c) => colors.has(c));
}

/** True when the card fits in a deck of these colors. */
export function fitsColors(card: CardDetails, colors: string[]): boolean {
  return card.colorIdentity.every((c) => colors.includes(c));
}

export function analyzeDeck(cards: CardDetails[], extraVocabulary: string[] = []): DeckAnalysis {
  const vocabulary = [...new Set([...subtypeVocabulary(cards), ...extraVocabulary])];
  const counts = new Map<string, number>();
  for (const card of cards) {
    const { types, subtypes } = parseTypeLine(card.typeLine);
    if (types.has("Creature")) for (const s of subtypes) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const mainCreatureType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const traits = new Map<string, Traits>();
  for (const card of cards) traits.set(card.name, deckCardTraits(card, vocabulary, mainCreatureType));
  return { traits, vocabulary, mainCreatureType, colors: deckColors(cards) };
}

/** cardTraits, with "choose a creature type" read as the deck's main creature type. */
export function deckCardTraits(card: CardDetails, vocabulary: string[], mainCreatureType?: string): Traits {
  const t = cardTraits(card, vocabulary);
  if (t.cares.delete("theme:chosen-type") && mainCreatureType) t.cares.add(`subtype:${mainCreatureType}`);
  return t;
}

/** What two cards share either way: tags one rewards and the other is or makes. */
export function linkTags(a: Traits, b: Traits): Tag[] {
  const tags = new Set<Tag>();
  for (const tag of a.cares) if (b.is.has(tag)) tags.add(tag);
  for (const tag of b.cares) if (a.is.has(tag)) tags.add(tag);
  return sortLinks([...tags].map((tag) => ({ tag, cards: [] }))).map((l) => l.tag);
}

/** Specific links first (subtypes and themes, then card types), then the ones with more cards. */
function sortLinks(links: TagLinks[]): TagLinks[] {
  const rank = (tag: Tag) => (tagKind(tag) === "type" ? 1 : 0);
  return links.sort((a, b) => rank(a.tag) - rank(b.tag) || b.cards.length - a.cards.length || a.tag.localeCompare(b.tag));
}

/** How one card works with the rest of the deck, by tag. `card` may be outside the deck (a recommendation). */
export function interactionsOf(card: Traits, deck: Map<string, Traits>, exclude?: string): CardInteractions {
  const uses = new Map<Tag, string[]>();
  const usedBy = new Map<Tag, string[]>();
  for (const [name, other] of deck) {
    if (name === exclude) continue;
    for (const tag of card.cares) if (other.is.has(tag)) uses.set(tag, [...(uses.get(tag) ?? []), name]);
    for (const tag of card.is) if (other.cares.has(tag)) usedBy.set(tag, [...(usedBy.get(tag) ?? []), name]);
  }
  const toLinks = (m: Map<Tag, string[]>) => sortLinks([...m].map(([tag, cards]) => ({ tag, cards: cards.sort() })));
  return { uses: toLinks(uses), usedBy: toLinks(usedBy) };
}

/** Every deck card linked to this one either way. */
export function partnersOf(interactions: CardInteractions): Set<string> {
  return new Set([...interactions.uses, ...interactions.usedBy].flatMap((l) => l.cards));
}
