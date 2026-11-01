import { describe, expect, it } from "vitest";
import { MAX_PLAYSTYLES, togglePlaystyle } from "./draft";

const style = (slug: string) => ({ slug, name: slug });

describe("togglePlaystyle", () => {
  it("adds a playstyle and takes it off again", () => {
    expect(togglePlaystyle([], style("tokens"))).toEqual([style("tokens")]);
    expect(togglePlaystyle([style("tokens")], style("tokens"))).toEqual([]);
  });

  it("stops at the limit, but still takes one off", () => {
    const full = Array.from({ length: MAX_PLAYSTYLES }, (_, i) => style(`s${i}`));
    expect(togglePlaystyle(full, style("one-more"))).toBe(full);
    expect(togglePlaystyle(full, full[0])).toHaveLength(MAX_PLAYSTYLES - 1);
  });
});
