import { ViewTransition, type ReactNode } from "react";

// Navigation tags each page change with a type (lib/nav.ts, app-link.tsx);
// these map the types to the slides and crossfade in globals.css.
const SLIDE = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };
const FADE = { "nav-fade": "nav-fade", default: "none" };

/**
 * Wraps a page so it slides in and out as you move around the app, and
 * crossfades when it stays put with new content (another card, another
 * theme). Goes in each page.tsx: layouts persist, so they never enter or exit.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={SLIDE} exit={SLIDE} update={FADE} default="none">
      {children}
    </ViewTransition>
  );
}
