// The Commander Game Changers list: cards so strong that Brackets 1 and 2 allow
// none and Bracket 3 allows up to three. Matching is by name, ignoring case,
// and a double-faced card matches by its full name or either face's.

const key = (name: string) => name.trim().toLowerCase();

/** The names to match Game Changers by. */
export function gameChangerKeys(names: string[]): Set<string> {
  const keys = new Set<string>();
  for (const name of names) {
    keys.add(key(name));
    for (const face of name.split(" // ")) keys.add(key(face));
  }
  return keys;
}

export function isGameChangerIn(keys: Set<string>, name: string): boolean {
  return keys.has(key(name)) || keys.has(key(name.split(" // ")[0]));
}
