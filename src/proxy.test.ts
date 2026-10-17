import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const request = (path: string, ip: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": ip, ...headers } });

/** Sends `count` requests and returns the status codes; 200 means "passed through". */
function send(count: number, make: () => NextRequest) {
  return Array.from({ length: count }, () => proxy(make()).status);
}

describe("proxy rate limits", () => {
  it("blocks card page loads past the limit with a plain-text 429", async () => {
    const statuses = send(61, () => request("/card?q=Sol+Ring", "192.0.2.1"));
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);

    const blocked = proxy(request("/card?q=Sol+Ring", "192.0.2.1"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked.text()).toMatch(/Too many requests/);
  });

  it("can't be skipped by claiming to be a prefetch", () => {
    const statuses = send(61, () => request("/card?q=Sol+Ring", "192.0.2.2", { "next-router-prefetch": "1" }));
    expect(statuses.at(-1)).toBe(429);
  });

  it("answers API calls past the limit with JSON", async () => {
    send(120, () => request("/api/autocomplete?q=at", "192.0.2.3"));
    const blocked = proxy(request("/api/autocomplete?q=at", "192.0.2.3"));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: expect.stringMatching(/Too many requests/) });
  });

  it("limits each visitor separately", () => {
    send(61, () => request("/card?q=x", "192.0.2.4"));
    expect(proxy(request("/card?q=x", "192.0.2.5")).status).toBe(200);
  });
});

describe("preview rate limit", () => {
  it("limits hover previews per visitor", () => {
    const statuses = Array.from({ length: 121 }, () => proxy(request("/api/preview?name=x", "192.0.2.9")).status);
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });
});
