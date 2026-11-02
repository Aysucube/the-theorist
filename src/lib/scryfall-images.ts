// Scryfall serves every card image at several sizes under the same path.

const SCRYFALL_IMAGE = /^(https:\/\/cards\.scryfall\.io\/)(small|normal|large|art_crop|border_crop)(\/.+\.jpg(?:\?.*)?)$/;
const SCRYFALL_HOST = "https://cards.scryfall.io/";

/** Where to load a card image from: Scryfall's go through our own server, which gets past its slow connections and keeps a copy. */
export const localImage = (url: string) => (url.startsWith(SCRYFALL_HOST) ? `/card-image/${url.slice(SCRYFALL_HOST.length)}` : url);

/**
 * The same Scryfall image at another size ("normal" for reading, "art_crop" for
 * the background). Undefined for images from elsewhere, e.g. TCGph's.
 */
export function scryfallImageAs(url: string | undefined, size: "normal" | "art_crop"): string | undefined {
  const match = url?.match(SCRYFALL_IMAGE);
  return match ? `${match[1]}${size}${match[3]}` : undefined;
}
