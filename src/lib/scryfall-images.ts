// Scryfall serves every card image at several sizes under the same path.

const SCRYFALL_IMAGE = /^(https:\/\/cards\.scryfall\.io\/)(small|normal|large|art_crop|border_crop)(\/.+\.jpg(?:\?.*)?)$/;

/**
 * The same Scryfall image at another size ("normal" for reading, "art_crop" for
 * the background). Undefined for images from elsewhere, e.g. TCGph's.
 */
export function scryfallImageAs(url: string | undefined, size: "normal" | "art_crop"): string | undefined {
  const match = url?.match(SCRYFALL_IMAGE);
  return match ? `${match[1]}${size}${match[3]}` : undefined;
}
