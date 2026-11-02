// Two-sided cards. Scryfall keeps the two sides of a printing's image at the same
// address but for "front" and "back", so an image is all it takes to turn a card
// over. A card turned over stays that way wherever it's showing, its hover card
// included, until it's turned back or the page is reloaded.
import { useSyncExternalStore } from "react";

/** Layouts with a second side printed on the back of the card. Split, adventure and flip cards have one image; meld's back is a card of its own. */
const TWO_SIDED = new Set(["transform", "modal_dfc", "double_faced_token", "reversible_card"]);

export const isTwoSided = (layout: string | undefined) => layout !== undefined && TWO_SIDED.has(layout);

/** A printing's image, whichever side and size of it, from Scryfall or our own server. */
const printingOf = (url: string | null | undefined) => url?.match(/\/(?:front|back)\/([^?]+)/)?.[1];

export const backOf = (url: string) => url.replace("/front/", "/back/");

const turned = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isTurned(url: string | undefined): boolean {
  const printing = printingOf(url);
  return printing !== undefined && turned.has(printing);
}

/** Turns over the printings these images are of, together, so they can't end up on opposite sides. */
export function turnOver(...urls: (string | null | undefined)[]) {
  const printings = [...new Set(urls.map(printingOf))].filter((p) => p !== undefined);
  if (printings.length === 0) return;
  const toBack = !printings.some((p) => turned.has(p));
  for (const printing of printings) {
    if (toBack) turned.add(printing);
    else turned.delete(printing);
  }
  listeners.forEach((listener) => listener());
}

/** For a card's onContextMenu: a right-click turns it over in place of the browser's menu, if it has another side to show. */
export function rightClickTurns(layout: string | undefined, ...urls: (string | null | undefined)[]) {
  return (event: { preventDefault: () => void }) => {
    if (!isTwoSided(layout) || !urls.some(printingOf)) return;
    event.preventDefault();
    turnOver(...urls);
  };
}

/** The image to show for a card: the one given, or its back while it's turned over. */
export function useShownSide<T extends string | undefined>(url: T): T {
  const back = useSyncExternalStore(
    subscribe,
    () => isTurned(url),
    () => false,
  );
  return (back && url ? backOf(url) : url) as T;
}
