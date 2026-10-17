import { describe, expect, it } from "vitest";
import { clientAddress, createRateLimiter } from "./rate-limit";

function clock(start = 0) {
  let time = start;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks until the window resets", () => {
    const c = clock();
    const check = createRateLimiter({ limit: 2, windowMs: 10_000, now: c.now });

    expect(check("a")).toMatchObject({ ok: true, remaining: 1 });
    expect(check("a")).toMatchObject({ ok: true, remaining: 0 });
    expect(check("a")).toMatchObject({ ok: false, remaining: 0, retryAfterSeconds: 10 });

    c.advance(9_500);
    expect(check("a")).toMatchObject({ ok: false, retryAfterSeconds: 1 });

    c.advance(500);
    expect(check("a")).toMatchObject({ ok: true, remaining: 1 });
  });

  it("counts each visitor separately", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 1_000, now: clock().now });
    expect(check("a").ok).toBe(true);
    expect(check("a").ok).toBe(false);
    expect(check("b").ok).toBe(true);
  });

  it("keeps working when flooded with distinct addresses", () => {
    const c = clock();
    const check = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    for (let i = 0; i < 20_000; i++) check(`ip-${i}`);
    // A brand-new visitor still gets through after the map was trimmed.
    expect(check("newcomer").ok).toBe(true);
  });
});

describe("clientAddress", () => {
  it("uses the first address the host's proxy forwarded", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
