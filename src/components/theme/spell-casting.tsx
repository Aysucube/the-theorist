"use client";

import { useEffect } from "react";

/** The most cards cast one after another before the rest go at once. */
const MAX_STAGGER = 12;

/**
 * Cards in galleries arrive like spells being cast: as each first comes into
 * view, a circle of runes flares over it and the card materializes out of the
 * light (globals.css, .spell-card). Cards stay hidden until then only once this
 * is running, so the galleries still show without it.
 */
export function SpellCasting() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const watched = new WeakSet<Element>();

    const viewer = new IntersectionObserver(
      (entries) => {
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          viewer.unobserve(entry.target);
          // Cards that come into view together are cast one after another.
          (entry.target as HTMLElement).style.setProperty("--spell-i", String(Math.min(order++, MAX_STAGGER)));
          entry.target.setAttribute("data-cast", "");
        }
      },
      { rootMargin: "0px 0px -4% 0px" },
    );

    const watchNew = () => {
      for (const card of document.querySelectorAll(".spell-card:not([data-cast])")) {
        if (watched.has(card)) continue;
        watched.add(card);
        viewer.observe(card);
      }
    };
    let queued = 0;
    const changes = new MutationObserver(() => {
      if (!queued) queued = requestAnimationFrame(() => ((queued = 0), watchNew()));
    });

    root.classList.add("spells");
    watchNew();
    changes.observe(document.body, { childList: true, subtree: true });
    return () => {
      viewer.disconnect();
      changes.disconnect();
      cancelAnimationFrame(queued);
      root.classList.remove("spells");
    };
  }, []);
  return null;
}
