// Reads MTGJSON's big files, shaped {"meta": {...}, "data": {"<id>": {...}, ...}},
// one entry of "data" at a time. AllPrices unpacks to about 1.5 GB, more than
// fits in one JavaScript string (V8 stops near 512 MB), so it can't simply be
// JSON.parse'd. Used by scripts/build-market-trends.ts; no imports so Node can
// run it directly.

const OPEN_OBJECT = 123; // {
const CLOSE_OBJECT = 125; // }
const OPEN_ARRAY = 91; // [
const CLOSE_ARRAY = 93; // ]
const QUOTE = 34; // "
const BACKSLASH = 92; // \

/**
 * Yields [id, value] for each entry of the top-level "data" object whose id
 * `wanted` accepts. Entries that aren't wanted are skipped without parsing.
 * `chunks` is the file's text in pieces of any size (e.g. a gunzip stream).
 */
export async function* dataEntries(
  chunks: AsyncIterable<string>,
  wanted: (id: string) => boolean = () => true,
): AsyncGenerator<[string, unknown]> {
  let depth = 0;
  let inString = false;
  let escaped = false;
  // The last string read where a key can appear: a top-level key, or an id inside "data".
  let key = "";
  let keyParts: string[] | null = null;
  let rootKey = "";
  let inData = false;
  // Text of the entry being kept, gathered across chunks.
  let entryParts: string[] | null = null;
  let entryId = "";

  for await (const chunk of chunks) {
    // A key or entry that started in an earlier chunk continues from this chunk's start.
    let keyStart = keyParts ? 0 : -1;
    let entryStart = entryParts ? 0 : -1;

    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);

      if (inString) {
        if (escaped) escaped = false;
        else if (c === BACKSLASH) escaped = true;
        else if (c === QUOTE) {
          inString = false;
          if (keyParts) {
            keyParts.push(chunk.slice(keyStart, i));
            key = keyParts.join("");
            keyParts = null;
          }
        }
        continue;
      }

      if (c === QUOTE) {
        inString = true;
        // Only strings at these depths are keys we care about; skip collecting the rest.
        if (depth === 1 || (depth === 2 && inData)) {
          keyParts = [];
          keyStart = i + 1;
        }
      } else if (c === OPEN_OBJECT || c === OPEN_ARRAY) {
        depth++;
        if (depth === 2 && rootKey === "data") inData = true;
        if (depth === 3 && inData && c === OPEN_OBJECT && wanted(key)) {
          entryParts = [];
          entryStart = i;
          entryId = key;
        }
      } else if (c === CLOSE_OBJECT || c === CLOSE_ARRAY) {
        depth--;
        if (depth === 2 && entryParts) {
          entryParts.push(chunk.slice(entryStart, i + 1));
          const text = entryParts.join("");
          entryParts = null;
          entryStart = -1;
          yield [entryId, JSON.parse(text)];
        }
        if (depth === 1) inData = false;
      } else if (c === 58 /* : */ && depth === 1) {
        rootKey = key;
      }
    }

    // Carry unfinished pieces over to the next chunk.
    if (keyParts) keyParts.push(chunk.slice(keyStart));
    if (entryParts && entryStart >= 0) entryParts.push(chunk.slice(entryStart));
  }
}
