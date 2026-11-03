"use client";

import { useEffect } from "react";

/** How long the arrival plays (globals.css, html.portal-arrival). */
const ARRIVAL_MS = 1000;

/**
 * The desktop app opens its first page with ?portal=1, which sets
 * html.portal-arrival before the first paint (layout.tsx) so the page arrives
 * through the welcome's portal. Once that's playing, this takes the flag out of
 * the address (a reload shouldn't replay it) and the class off when it's done.
 */
export function PortalArrival() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("portal-arrival")) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("portal")) {
      url.searchParams.delete("portal");
      window.history.replaceState(window.history.state, "", url);
    }
    const timer = window.setTimeout(() => root.classList.remove("portal-arrival"), ARRIVAL_MS + 100);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
