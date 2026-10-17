// Where to put a hover card so it stays fully on screen.

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Places the card just right of the anchor (the mouse pointer, or a focused
 * link), flipping to the left near the right edge, and keeps it within the
 * window vertically.
 */
export function placeHoverCard(anchor: Rect, viewport: Size, card: Size, gap = 12): { left: number; top: number } {
  let left = anchor.right + gap;
  if (left + card.width > viewport.width - gap) left = anchor.left - gap - card.width;
  left = Math.max(gap, Math.min(left, viewport.width - card.width - gap));

  const top = Math.max(gap, Math.min(anchor.top - card.height / 3, viewport.height - card.height - gap));
  return { left, top };
}
