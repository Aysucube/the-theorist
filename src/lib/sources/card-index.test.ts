import { describe, expect, it, vi } from "vitest";
import type { CardDetails } from "@/lib/types";
import { awaitCardIndex, cardIndexNeeds, indexedDetails, saveCardIndex } from "./card-index";

const files = vi.hoisted(() => new Map<string, Buffer>());
const saving = vi.hoisted(() => ({ on: true }));
const name = (file: string) => file.replace(/\\/g, "/").split("/").pop()!;
vi.mock("node:fs/promises", () => ({
  mkdir: async () => {},
  readFile: async (file: string) => {
    const saved = files.get(name(file));
    if (!saved) throw new Error("no file");
    return saved;
  },
  writeFile: async (file: string, data: Buffer) => void files.set(name(file), Buffer.from(data)),
  rename: async (from: string, to: string) => {
    files.set(name(to), files.get(name(from))!);
    files.delete(name(from));
  },
}));
vi.mock("@/lib/saved-data", () => ({ savingOnComputer: () => saving.on }));

const card = (name: string, typeLine = "Instant"): CardDetails => ({
  name,
  typeLine,
  colorIdentity: [],
  layout: "normal",
  oracleText: "",
  keywords: [],
  cmc: 1,
});

// The index is held for the whole process, so these run in order.
describe("the card index", () => {
  it("finds nothing before Scryfall's daily file has been read", async () => {
    expect(await indexedDetails(["Sol Ring"])).toEqual({ found: {}, missing: ["Sol Ring"] });
    expect(await cardIndexNeeds("2026-11-03")).toBe(true);
  });

  it("stops waiting for the first index when the daily file can't be read", async () => {
    let fail!: (error: Error) => void;
    awaitCardIndex(new Promise((_, reject) => (fail = reject)));
    const lookup = indexedDetails(["Sol Ring"]);
    fail(new Error("Scryfall: couldn't download the daily card file"));
    expect(await lookup).toEqual({ found: {}, missing: ["Sol Ring"] });
  });

  it("waits for the first index while the daily file is being read, rather than going to Scryfall", async () => {
    let finish!: () => void;
    awaitCardIndex(new Promise<void>((resolve) => (finish = resolve)));
    const lookup = indexedDetails(["Sol Ring"]);
    await saveCardIndex("2026-11-02", [card("Sol Ring", "Artifact")]);
    expect((await lookup).found["Sol Ring"]?.name).toBe("Sol Ring");
    finish();
  });

  it("finds cards by name in any case, two-sided cards by their front too, and says which it doesn't have", async () => {
    await saveCardIndex("2026-11-03", [
      card("Sol Ring", "Artifact"),
      card("Fire // Ice"),
      card("Delver of Secrets // Insectile Aberration", "Creature — Human Wizard // Creature — Human Insect"),
      // A card named like another's front half is found by its own name.
      card("Bind // Liberate"),
      card("Bind", "Sorcery"),
    ]);

    const { found, missing } = await indexedDetails(["sol ring", "Fire // Ice", "Fire", "Delver of Secrets", "Bind", "Nope"]);
    expect(Object.fromEntries(Object.entries(found).map(([asked, c]) => [asked, c.name]))).toEqual({
      "sol ring": "Sol Ring",
      "Fire // Ice": "Fire // Ice",
      Fire: "Fire // Ice",
      "Delver of Secrets": "Delver of Secrets // Insectile Aberration",
      Bind: "Bind",
    });
    expect(missing).toEqual(["Nope"]);
  });

  it("knows which day's file it holds", async () => {
    expect(await cardIndexNeeds("2026-11-03")).toBe(false);
    expect(await cardIndexNeeds("2026-11-04")).toBe(true);
  });

  it("is saved on the computer for the next start", () => {
    expect(files.has("details.json.gz")).toBe(true);
  });

  it("isn't used on a server that isn't your own computer", async () => {
    saving.on = false;
    expect(await indexedDetails(["Sol Ring"])).toEqual({ found: {}, missing: ["Sol Ring"] });
    expect(await cardIndexNeeds("2026-11-04")).toBe(false);
  });
});
