import { ViewTransition, type ReactNode } from "react";

// Moving to another page opens it through a ring of light (page-turn.tsx), so
// the page itself doesn't slide; staying on a page with new content (another
// card, another theme) crossfades, tagged by navigation (lib/nav.ts, app-link.tsx).
const FADE = { "nav-fade": "nav-fade", default: "none" };

/**
 * Wraps a page so it crossfades when it stays put with new content. Goes in
 * each page.tsx: layouts persist, so they never update this way.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="none" exit="none" update={FADE} default="none">
      {children}
    </ViewTransition>
  );
}
