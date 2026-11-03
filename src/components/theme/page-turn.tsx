"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/** How long a page takes to open (globals.css, html.page-turn). */
const TURN_MS = 720;

/**
 * Every move to another page opens it from the window's center through a ring
 * of light, as the desktop app's first page does: links, the back button and
 * pages opened in code alike. Set before the new page is painted, so it never
 * shows before it opens. The nav bar stays put.
 */
export function PageTurn() {
  const pathname = usePathname();
  const last = useRef(pathname);
  useLayoutEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    const root = document.documentElement;
    root.classList.remove("page-turn");
    // Starts it over when pages change quickly.
    void root.offsetWidth;
    root.classList.add("page-turn");
    const timer = window.setTimeout(() => root.classList.remove("page-turn"), TURN_MS + 60);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}
