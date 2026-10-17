import { readFileSync } from "node:fs";

/** Reads a saved page from this folder. Refresh them with `npm run fixtures:update`. */
export function fixture(path: string): string {
  return readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
}

/**
 * A fetch stand-in that serves fixtures by URL. Unlisted URLs get a 404.
 * Records every requested URL and its headers in `calls`.
 */
export function fakeFetch(routes: Record<string, string | { status: number; body?: string }>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers)) });
    const route = routes[url];
    if (route === undefined) return new Response("not found", { status: 404 });
    if (typeof route === "string") return new Response(route, { status: 200 });
    return new Response(route.body ?? "", { status: route.status });
  };
  return { fetch, calls };
}
