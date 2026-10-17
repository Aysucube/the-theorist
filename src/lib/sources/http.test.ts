import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceFetch, USER_AGENT } from "./http";

describe("sourceFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends our User-Agent and a timeout signal", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetch);

    await sourceFetch("Scryfall", "https://api.scryfall.com/x", "application/json");

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("user-agent")).toBe(USER_AGENT);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a slow source as a timeout", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(sourceFetch("TCGph", "https://tcgph.com/x", "text/html")).rejects.toThrow(
      "TCGph: no answer within 10s",
    );
  });

  it("reports other failures as a network error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(sourceFetch("EDHREC", "https://json.edhrec.com/x", "application/json")).rejects.toThrow(
      "EDHREC: network error",
    );
  });
});
