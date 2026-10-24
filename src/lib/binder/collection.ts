// The Binder: a player's whole collection, read from a pasted list or a
// collection export (ManaBox, Moxfield, Archidekt and Deckbox all export CSV
// with a name column and a count column). Kept free of React and storage.
import { parseDeckList, type DeckCard } from "@/lib/deck";

const key = (name: string) => name.trim().toLowerCase();

const NAME_HEADERS = new Set(["name", "card name", "card"]);
const COUNT_HEADERS = new Set(["count", "quantity", "qty", "amount", "total quantity", "have"]);
const BASIC_LANDS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);

/** Splits one line of CSV into cells, keeping commas inside quotes ("Tergrid, God of Fright"). */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

function addTo(cards: Map<string, DeckCard>, name: string, qty: number) {
  const existing = cards.get(key(name));
  if (existing) existing.qty += qty;
  else cards.set(key(name), { name, qty });
}

/**
 * Reads a collection: a CSV export (any column order, as long as it has a
 * name column) or a plain list, one card per line ("4 Forest", "1x Sol Ring
 * (CMM) 410"). Printings of the same card are added together.
 */
export function parseCollection(text: string): DeckCard[] {
  // Some exports start with a byte-order mark or Excel's "sep=," hint (Dragon Shield).
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (/^"?sep=.?"?$/i.test(lines[0]?.trim() ?? "")) lines.shift();
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const nameAt = header.findIndex((h) => NAME_HEADERS.has(h));
  if (!lines[0].includes(",") || nameAt < 0) return parseDeckList(text);

  const countAt = header.findIndex((h) => COUNT_HEADERS.has(h));
  const cards = new Map<string, DeckCard>();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const name = cells[nameAt];
    if (!name) continue;
    const count = countAt >= 0 ? Number.parseInt(cells[countAt], 10) : 1;
    addTo(cards, name, Number.isFinite(count) && count > 0 ? count : 1);
  }
  return [...cards.values()];
}

/** Adds cards to the collection (adding up copies), or replaces it. */
export function mergeCollection(binder: DeckCard[], cards: DeckCard[], mode: "add" | "replace"): DeckCard[] {
  const merged = new Map<string, DeckCard>();
  if (mode === "add") for (const card of binder) merged.set(key(card.name), { ...card });
  for (const card of cards) addTo(merged, card.name, card.qty);
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** How many copies of each card the collection holds, by name and by the front face's name. */
export function ownedCounts(binder: DeckCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of binder) {
    for (const name of new Set([key(card.name), key(card.name.split(" // ")[0])])) {
      counts.set(name, (counts.get(name) ?? 0) + card.qty);
    }
  }
  return counts;
}

export function ownedCount(counts: Map<string, number>, name: string): number {
  return counts.get(key(name)) ?? counts.get(key(name.split(" // ")[0])) ?? 0;
}

export function isBasicLandName(name: string): boolean {
  return BASIC_LANDS.has(key(name).replace(/^snow-covered /, ""));
}

/**
 * The cards (and copies) a deck needs that the collection doesn't have.
 * Basic lands are left out unless asked for, since most players have plenty.
 */
export function missingFromBinder(deck: DeckCard[], counts: Map<string, number>, includeBasics = false): DeckCard[] {
  return deck.flatMap((card) => {
    if (!includeBasics && isBasicLandName(card.name)) return [];
    const short = card.qty - ownedCount(counts, card.name);
    return short > 0 ? [{ name: card.name, qty: short }] : [];
  });
}
