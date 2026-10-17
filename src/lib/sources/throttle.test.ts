import { describe, expect, it } from "vitest";
import { createThrottle, ThrottledError } from "./throttle";

/** A clock that only moves when told to; delays resolve at once and record how long they'd be. */
function fakeTime() {
  let time = 0;
  const waits: number[] = [];
  return {
    now: () => time,
    delay: async (ms: number) => {
      waits.push(ms);
    },
    advance: (ms: number) => (time += ms),
    waits,
  };
}

const options = { spacingMs: { slow: 500, fast: 100 }, backOffMs: 30_000, maxWaitMs: 10_000 };

describe("createThrottle", () => {
  it("spaces requests in a lane in the order they arrive", async () => {
    const t = fakeTime();
    const throttle = createThrottle({ ...options, ...t });

    await Promise.all([throttle.wait("slow"), throttle.wait("slow"), throttle.wait("slow")]);
    expect(t.waits).toEqual([500, 1000]);
  });

  it("keeps lanes independent", async () => {
    const t = fakeTime();
    const throttle = createThrottle({ ...options, ...t });

    await throttle.wait("slow");
    await throttle.wait("fast");
    expect(t.waits).toEqual([]);
  });

  it("doesn't wait when requests are already far enough apart", async () => {
    const t = fakeTime();
    const throttle = createThrottle({ ...options, ...t });

    await throttle.wait("slow");
    t.advance(600);
    await throttle.wait("slow");
    expect(t.waits).toEqual([]);
  });

  it("refuses every lane during a back-off, then recovers", async () => {
    const t = fakeTime();
    const throttle = createThrottle({ ...options, ...t });

    throttle.backOff();
    await expect(throttle.wait("slow")).rejects.toThrow(ThrottledError);
    await expect(throttle.wait("fast")).rejects.toThrow(/paused 30s/);

    t.advance(30_000);
    await expect(throttle.wait("fast")).resolves.toBeUndefined();
  });

  it("refuses instead of queueing a request for too long", async () => {
    const t = fakeTime();
    const throttle = createThrottle({ ...options, maxWaitMs: 1_000, ...t });

    const queued = [throttle.wait("slow"), throttle.wait("slow"), throttle.wait("slow")];
    await expect(throttle.wait("slow")).rejects.toThrow(/too many lookups queued/);
    await Promise.all(queued);
  });
});
