// The computer's copy of the binder and My Decks: one JSON file each in
// .data/saved, with the previous version kept beside it. Server only.
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SavedDoc, SavedKey } from "./saved-shape";

const DIR = path.join(process.cwd(), ".data", "saved");

/**
 * Keeping a copy on the computer is for The Theorist run on your own computer:
 * the launchers turn it on (and so does `npm run dev`). A shared server never
 * does, so visitors don't see each other's binders.
 */
export function savingOnComputer(): boolean {
  return process.env.THEORIST_SAVE_ON_COMPUTER === "1" || process.env.NODE_ENV === "development";
}

/** Only this computer's own browser may read or change the copy, not other devices on the network. */
export function isSameComputer(request: Request): boolean {
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export async function readSaved(key: SavedKey): Promise<SavedDoc | null> {
  try {
    const doc = JSON.parse(await readFile(path.join(DIR, `${key}.json`), "utf8")) as SavedDoc;
    return typeof doc?.savedAt === "number" ? doc : null;
  } catch {
    return null;
  }
}

/** Writes the new copy whole (via a temporary file, so a crash can't leave half a binder), keeping the last one. */
export async function writeSaved(key: SavedKey, doc: SavedDoc): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${key}.json`);
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(doc));
  await copyFile(file, path.join(DIR, `${key}.previous.json`)).catch(() => {});
  await rename(temp, file);
}
