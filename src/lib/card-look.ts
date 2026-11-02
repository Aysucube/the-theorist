// What a card looks like, for a hover card: its image and rules text. Unlike its
// prices these are quick to find, often already in this browser, so a hover card
// can show them straight away. The image starts loading as soon as the pointer
// lands on a card, so it's usually there by the time the hover card opens.
import { savedDetails } from "./binder/card-cache";
import { subscribeImage } from "./image-loader";
import { fetchJsonWithRetry } from "./retry";
import type { CardPreview } from "./types";

export type CardLook = Pick<CardPreview, "name" | "imageUrl" | "typeLine" | "manaCost" | "colorIdentity" | "oracleText">;

// Each card once this visit. A card that can't be found is asked about again next time.
const asked = new Map<string, Promise<CardLook | undefined>>();
const found = new Map<string, CardLook>();

async function find(name: string): Promise<CardLook | undefined> {
  const saved = await savedDetails(name);
  if (saved) return saved;
  const look = await fetchJsonWithRetry<Partial<CardLook>>(`/api/preview/card?name=${encodeURIComponent(name)}`, { busyReason: "Scryfall is busy" });
  return look === "error" || !look.name ? undefined : (look as CardLook);
}

export function cardLook(name: string): Promise<CardLook | undefined> {
  const seen = asked.get(name);
  if (seen) return seen;
  const look = find(name).then((card) => {
    if (card) found.set(name, card);
    else asked.delete(name);
    return card;
  });
  asked.set(name, look);
  return look;
}

/** A card's look if it's already in hand, so a hover card can open with it. */
export const cardLookNow = (name: string) => found.get(name);

const preload = (url: string | undefined) => {
  if (url) subscribeImage(url, () => {})();
};

/** Gets a card's image coming: the one given, for a particular printing, or else its usual one. */
export function prepareCardLook(name: string, imageUrl?: string) {
  preload(imageUrl);
  void cardLook(name).then((card) => {
    if (!imageUrl) preload(card?.imageUrl);
  });
}
