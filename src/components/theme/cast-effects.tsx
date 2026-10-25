"use client";

import { useEffect } from "react";

/**
 * Buttons marked data-cast answer a press with a ring of light spreading from
 * the point pressed, like a spell going off. One listener for the whole page;
 * each ring is animated off the main thread (Web Animations) and removed when
 * done. Skipped for anyone who prefers reduced motion.
 */
export function CastEffects() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onPress = (event: PointerEvent) => {
      if (reduce.matches || event.button !== 0) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-cast]");
      if (!target || target.matches(":disabled")) return;
      const rect = target.getBoundingClientRect();
      const ring = document.createElement("span");
      ring.className = "cast-ring";
      ring.style.left = `${event.clientX - rect.left}px`;
      ring.style.top = `${event.clientY - rect.top}px`;
      ring.style.setProperty("--r", `${Math.max(rect.width, rect.height) * 1.15}px`);
      target.appendChild(ring);
      ring
        .animate(
          [
            { transform: "scale(0.15)", opacity: 0.9 },
            { transform: "scale(1)", opacity: 0 },
          ],
          { duration: 350, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        )
        .finished.finally(() => ring.remove());
    };
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, []);
  return null;
}
