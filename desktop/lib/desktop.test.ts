import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canOpenOutside, isAppUrl } from "./links.mjs";
import { copyOldData, dataFolderIn, findOldData, hasSavedData, likelyOldFolders } from "./old-data.mjs";
import { pickPort } from "./ports.mjs";
import { readWindowState } from "./window-state.mjs";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "theorist-desktop-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("links", () => {
  const app = "http://127.0.0.1:47321";
  it("keeps the app's own pages in its window", () => {
    expect(isAppUrl(`${app}/card?q=Sol+Ring`, app)).toBe(true);
    expect(isAppUrl("http://127.0.0.1:3000/", app)).toBe(false);
    expect(isAppUrl("https://edhrec.com/", app)).toBe(false);
    expect(isAppUrl("not a url", app)).toBe(false);
    expect(isAppUrl(`${app}/`, null)).toBe(false);
  });

  it("lets the browser open web pages and email, nothing that could start a program", () => {
    expect(canOpenOutside("https://tcgph.com/products/1")).toBe(true);
    expect(canOpenOutside("mailto:someone@example.com")).toBe(true);
    expect(canOpenOutside("file:///C:/Windows/System32/calc.exe")).toBe(false);
    expect(canOpenOutside("ms-settings:privacy")).toBe(false);
    expect(canOpenOutside("javascript:alert(1)")).toBe(false);
  });
});

describe("the server's port", () => {
  it("is the preferred one when it's free, and the next one when it isn't", async () => {
    const preferred = 47_000 + Math.floor(Math.random() * 900);
    expect(await pickPort(preferred)).toBe(preferred);
    const taken = net.createServer();
    await new Promise<void>((resolve) => taken.listen(preferred, "127.0.0.1", resolve));
    try {
      expect(await pickPort(preferred)).toBe(preferred + 1);
    } finally {
      await new Promise((resolve) => taken.close(resolve));
    }
  });
});

describe("the window's place", () => {
  const screens = [{ x: 0, y: 0, width: 1920, height: 1040 }];

  it("opens where it was closed while that's on a screen", async () => {
    const file = path.join(dir, "window.json");
    await writeFile(file, JSON.stringify({ x: 100, y: 80, width: 1200, height: 800, maximized: true }));
    expect(readWindowState(file, screens)).toEqual({ x: 100, y: 80, width: 1200, height: 800, maximized: true });
  });

  it("keeps the size but not a place on a screen that's gone", async () => {
    const file = path.join(dir, "window.json");
    await writeFile(file, JSON.stringify({ x: 3000, y: 80, width: 1200, height: 800 }));
    expect(readWindowState(file, screens)).toEqual({ width: 1200, height: 800, maximized: false });
  });

  it("starts at a sensible size with nothing saved, or something odd saved", async () => {
    expect(readWindowState(path.join(dir, "none.json"), screens)).toEqual({ width: 1360, height: 880 });
    const file = path.join(dir, "window.json");
    await writeFile(file, JSON.stringify({ width: 10, height: "tall" }));
    expect(readWindowState(file, screens)).toEqual({ width: 1360, height: 880 });
  });
});

describe("the launcher version's data", () => {
  async function launcherFolder(name: string, savedMinutesAgo: number) {
    const data = path.join(dir, name, ".data");
    await mkdir(path.join(data, "saved"), { recursive: true });
    await mkdir(path.join(data, "images"), { recursive: true });
    await mkdir(path.join(data, "next-cache"), { recursive: true });
    const binder = path.join(data, "saved", "binder.json");
    await writeFile(binder, JSON.stringify({ savedAt: 1000, value: [{ name: `${name} card`, qty: 1 }] }));
    await writeFile(path.join(data, "saved", "binder.previous.json"), JSON.stringify({ savedAt: 900, value: [] }));
    await writeFile(path.join(data, "images", "sol-ring.jpg"), "image");
    await writeFile(path.join(data, "next-cache", "x.entry"), "build-only");
    const at = new Date(Date.now() - savedMinutesAgo * 60_000);
    await utimes(binder, at, at);
    return data;
  }

  it("looks in the usual places under the home folder", () => {
    const places = likelyOldFolders("/home/me");
    expect(places[0]).toBe(path.join("/home/me", "Documents", "The Theorist", "commander-ph", ".data"));
    expect(places.every((p) => p.endsWith(".data"))).toBe(true);
  });

  it("picks the folder saved to most recently, skipping ones with nothing saved", async () => {
    const older = await launcherFolder("older", 60);
    const newer = await launcherFolder("newer", 5);
    await mkdir(path.join(dir, "empty", ".data", "saved"), { recursive: true });
    expect(await findOldData([path.join(dir, "missing"), path.join(dir, "empty", ".data"), older, newer])).toBe(newer);
    expect(await findOldData([path.join(dir, "missing")])).toBeNull();
  });

  it("finds the data in a folder someone picks: the app folder, its .data, or its commander-ph", async () => {
    const data = await launcherFolder("The Theorist", 1);
    expect(await dataFolderIn(path.join(dir, "The Theorist"))).toBe(data);
    expect(await dataFolderIn(data)).toBe(data);
    expect(await dataFolderIn(dir)).toBeNull();
  });

  it("copies the saved lists and caches in, leaving out the old build's cache and the old folder as it was", async () => {
    const from = await launcherFolder("old", 1);
    const to = path.join(dir, "app", "data");
    expect(await hasSavedData(to)).toBe(false);
    await copyOldData(from, to);
    expect(JSON.parse(await readFile(path.join(to, "saved", "binder.json"), "utf8"))).toEqual({ savedAt: 1000, value: [{ name: "old card", qty: 1 }] });
    expect(await readFile(path.join(to, "images", "sol-ring.jpg"), "utf8")).toBe("image");
    await expect(readFile(path.join(to, "next-cache", "x.entry"))).rejects.toThrow();
    expect(await hasSavedData(to)).toBe(true);
    expect(JSON.parse(await readFile(path.join(from, "saved", "binder.json"), "utf8")).savedAt).toBe(1000);
  });

  it("on request, marks the lists as saved now so they win over the window's own copy", async () => {
    const from = await launcherFolder("old", 1);
    const to = path.join(dir, "app", "data");
    await mkdir(path.join(to, "images"), { recursive: true });
    await writeFile(path.join(to, "images", "sol-ring.jpg"), "newer image");
    const before = Date.now();
    await copyOldData(from, to, { freshen: true });
    const binder = JSON.parse(await readFile(path.join(to, "saved", "binder.json"), "utf8"));
    expect(binder.savedAt).toBeGreaterThanOrEqual(before);
    expect(binder.value).toEqual([{ name: "old card", qty: 1 }]);
    // The earlier copy stays as it was, and caches the app already has aren't replaced.
    expect(JSON.parse(await readFile(path.join(to, "saved", "binder.previous.json"), "utf8")).savedAt).toBe(900);
    expect(await readFile(path.join(to, "images", "sol-ring.jpg"), "utf8")).toBe("newer image");
  });
});
