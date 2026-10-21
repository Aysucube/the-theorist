// Deck Synergy: a whole deck (name, commander, cards) as one short code to
// copy, paste or put in a link, plus a plain text list for other deck sites.
// Codes look like "TT1.<compressed deck>"; nothing is stored on a server.
import type { DeckCard } from "@/lib/deck";

export interface DeckToShare {
  name?: string;
  commander?: string;
  cards: DeckCard[];
}

const PREFIX = "TT1.";

/** Base64 that's safe in a URL. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** A deck as a short code, e.g. "TT1.q1YqzszLzs..." */
export async function encodeDeck(deck: DeckToShare): Promise<string> {
  const payload = { n: deck.name || undefined, c: deck.commander || undefined, d: deck.cards.map((c) => (c.qty === 1 ? c.name : [c.qty, c.name])) };
  const packed = await transform(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream("deflate-raw"));
  return PREFIX + toBase64Url(packed);
}

/** True for text that looks like a deck code rather than a card list. */
export function isDeckCode(text: string): boolean {
  return text.trim().startsWith(PREFIX);
}

/** The deck in a code, or null if the code is damaged or not one of ours. */
export async function decodeDeck(code: string): Promise<DeckToShare | null> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  try {
    const json = new TextDecoder().decode(await transform(fromBase64Url(trimmed.slice(PREFIX.length)), new DecompressionStream("deflate-raw")));
    const payload = JSON.parse(json) as { n?: unknown; c?: unknown; d?: unknown };
    if (!Array.isArray(payload.d)) return null;
    const cards: DeckCard[] = [];
    for (const entry of payload.d) {
      const [qty, name] = typeof entry === "string" ? [1, entry] : Array.isArray(entry) ? entry : [];
      if (typeof name !== "string" || !name.trim() || !Number.isInteger(qty) || qty < 1 || qty > 99) return null;
      cards.push({ name, qty });
    }
    return {
      name: typeof payload.n === "string" ? payload.n : undefined,
      commander: typeof payload.c === "string" ? payload.c : undefined,
      cards,
    };
  } catch {
    return null;
  }
}

/** A plain text list, commander first, as Moxfield and Archidekt import it. */
export function deckToText(deck: DeckToShare): string {
  const key = (n: string) => n.trim().toLowerCase();
  const commander = deck.commander ? deck.cards.find((c) => key(c.name) === key(deck.commander!)) : undefined;
  const rest = deck.cards.filter((c) => c !== commander);
  const lines = rest.map((c) => `${c.qty} ${c.name}`);
  return commander || deck.commander
    ? ["Commander", `1 ${commander?.name ?? deck.commander}`, "", "Deck", ...lines].join("\n")
    : lines.join("\n");
}
