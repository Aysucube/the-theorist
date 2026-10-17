// Plain helpers behind the search box's suggestion list, kept free of React so they're easy to test.

/**
 * Where the highlight goes after an arrow key. -1 means nothing highlighted
 * (the text box itself); moving past either end wraps around through -1.
 */
export function moveHighlight(current: number, direction: "up" | "down", count: number): number {
  if (count === 0) return -1;
  if (direction === "down") return current >= count - 1 ? -1 : current + 1;
  return current <= -1 ? count - 1 : current - 1;
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Splits a suggestion around the first place the query appears, ignoring case
 * and accents, so the typed part can be shown in bold: "Lim-Dûl's Vault" with
 * "dul" -> ["Lim-", "Dûl", "'s Vault"]. Returns null when there's no match.
 */
export function splitMatch(name: string, query: string): [string, string, string] | null {
  const q = fold(query.trim());
  const folded = fold(name);
  // Folding must keep positions aligned with the original for the slices to be right.
  if (!q || folded.length !== name.length) return null;
  const at = folded.indexOf(q);
  if (at === -1) return null;
  return [name.slice(0, at), name.slice(at, at + q.length), name.slice(at + q.length)];
}
