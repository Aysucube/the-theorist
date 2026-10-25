// Which way a page transition should go. The app's sections sit in the order
// the nav lists them; moving right along it (or deeper into a section) slides
// the page left, moving back slides it right, and staying on the same page with
// new content crossfades. Pure, so it's easy to test.

export type TransitionType = "nav-forward" | "nav-back" | "nav-fade";

/** The sections in nav order. A card page sits under the front page. */
const SECTIONS = ["/", "/binder", "/decks", "/deck", "/market", "/shopping"];

function place(path: string): { section: number; depth: number } {
  const clean = path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  if (clean === "/") return { section: 0, depth: 0 };
  const parts = clean.split("/").filter(Boolean);
  const section = SECTIONS.indexOf(`/${parts[0]}`);
  // Anything outside the sections (a card, an unknown page) counts as one step below the front page.
  return section < 0 ? { section: 0, depth: parts.length } : { section, depth: parts.length - 1 };
}

/** The transition for a navigation from one pathname to another. */
export function transitionFor(from: string, to: string): TransitionType {
  const a = place(from);
  const b = place(to);
  if (a.section !== b.section) return b.section > a.section ? "nav-forward" : "nav-back";
  if (a.depth !== b.depth) return b.depth > a.depth ? "nav-forward" : "nav-back";
  return "nav-fade";
}

/**
 * The pathname a link points to, or undefined when it leaves the app or only
 * jumps within the page. Object hrefs without a pathname stay on the current page.
 */
export function linkPathname(href: string | { pathname?: string | null }, current: string): string | undefined {
  if (typeof href !== "string") return href.pathname ?? current;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) return undefined;
  if (href.startsWith("?")) return current;
  return new URL(href, `http://local${current.endsWith("/") ? current : `${current}/`}`).pathname;
}
