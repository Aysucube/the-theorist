import { describe, expect, it } from "vitest";
import { dataEntries } from "./json-stream.ts";

const sample = {
  meta: { date: "2026-10-17", version: "5.3.0", data: { decoy: { x: 1 } } },
  data: {
    "uuid-a": { paper: { tcgplayer: { retail: { normal: { "2026-10-16": 1.5, "2026-10-17": 3 } } } } },
    "uuid-b": { name: "Tricky } { \" [ ] card", text: "{T}: Add {G}.\\", list: [1, [2, { a: 3 }]] },
    "uuid-c": {},
  },
};

async function* inPieces(text: string, size: number) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

async function collect(text: string, size: number, wanted?: (id: string) => boolean) {
  const out: [string, unknown][] = [];
  for await (const entry of dataEntries(inPieces(text, size), wanted)) out.push(entry);
  return out;
}

describe("dataEntries", () => {
  const text = JSON.stringify(sample);
  const expected = Object.entries(sample.data);

  it("yields every entry of data, and nothing from meta", async () => {
    expect(await collect(text, text.length)).toEqual(expected);
  });

  it("gives the same answer however the text is split into chunks", async () => {
    for (const size of [1, 2, 3, 7, 16, 61]) {
      expect(await collect(text, size)).toEqual(expected);
    }
  });

  it("skips entries that aren't wanted", async () => {
    expect((await collect(text, 5, (id) => id === "uuid-b")).map(([id]) => id)).toEqual(["uuid-b"]);
  });

  it("handles pretty-printed files too", async () => {
    expect(await collect(JSON.stringify(sample, null, 2), 9)).toEqual(expected);
  });
});
