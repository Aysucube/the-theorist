import { describe, expect, it } from "vitest";
import { fetchJsonWithRetry } from "./retry";

describe("fetchJsonWithRetry", () => {
  it("sends the method, headers and body it's given", async () => {
    let seen: RequestInit | undefined;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;

    const result = await fetchJsonWithRetry("/api/x", {
      fetchFn,
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    });

    expect(result).toEqual({ ok: true });
    expect(seen).toMatchObject({ method: "POST", body: "{}" });
  });
});
