// The launcher version of The Theorist kept everything in a .data folder beside
// it (the binder, My Decks, the shopping list, price history, saved EDHREC pages
// and card images). On its first start the app looks for that folder in the
// usual places and copies it in, so nothing has to be entered again; the old
// folder is only read, never changed.
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** What the launcher kept that's worth bringing; next-cache belongs to one build only. */
const BROUGHT = ["saved", "price-history", "cards", "edhrec", "edhrec-articles", "spellbook-combos", "stores", "images"];
/** binder.json, decks.previous.json... */
const SAVED_FILE = /^[a-z]+(\.previous)?\.json$/;

/** Where the launcher version is usually unpacked, under the home folder. */
export function likelyOldFolders(home) {
  return [
    ["Documents", "The Theorist", "commander-ph"],
    ["Documents", "The Theorist"],
    ["Downloads", "The Theorist"],
    ["Desktop", "The Theorist"],
    ["Downloads", "The Theorist for Mac", "The Theorist"],
    ["Documents", "commander-ph"],
  ].map((parts) => path.join(home, ...parts, ".data"));
}

const isFolder = (p) =>
  stat(p).then(
    (s) => s.isDirectory(),
    () => false,
  );

/** When the folder's binder, decks or lists were last saved; null if it has none. */
async function lastSaved(dataFolder) {
  try {
    const files = (await readdir(path.join(dataFolder, "saved"))).filter((f) => SAVED_FILE.test(f) && !f.includes(".previous"));
    if (files.length === 0) return null;
    const times = await Promise.all(files.map(async (f) => (await stat(path.join(dataFolder, "saved", f))).mtimeMs));
    return Math.max(...times);
  } catch {
    return null;
  }
}

/** The launcher's data folder for a folder someone picked: the folder itself, its .data, or the .data in its commander-ph. */
export async function dataFolderIn(folder) {
  for (const candidate of [folder, path.join(folder, ".data"), path.join(folder, "commander-ph", ".data")]) {
    if ((await isFolder(path.join(candidate, "saved"))) && (await lastSaved(candidate)) !== null) return candidate;
  }
  return null;
}

/** Of these data folders, the one saved to most recently; null if none has anything saved. */
export async function findOldData(candidates) {
  let best = null;
  let bestAt = -Infinity;
  for (const folder of candidates) {
    const at = await lastSaved(folder);
    if (at !== null && at > bestAt) {
      best = folder;
      bestAt = at;
    }
  }
  return best;
}

/** Whether the app already has a binder, decks or lists of its own. */
export async function hasSavedData(dataFolder) {
  return (await lastSaved(dataFolder)) !== null;
}

/**
 * Copies the launcher's data into the app's. Saved lists replace the app's;
 * with `freshen` they're marked as saved now, so they win over the window's
 * own copy (which is merged into them rather than lost). Caches only add what
 * the app doesn't have yet.
 */
export async function copyOldData(from, to, { freshen = false } = {}) {
  for (const name of BROUGHT) {
    const source = path.join(from, name);
    if (!(await isFolder(source))) continue;
    const target = path.join(to, name);
    if (name !== "saved") {
      await cp(source, target, { recursive: true, force: false, errorOnExist: false });
      continue;
    }
    await mkdir(target, { recursive: true });
    for (const file of await readdir(source)) {
      if (!SAVED_FILE.test(file)) continue;
      let text = await readFile(path.join(source, file), "utf8");
      if (freshen && !file.includes(".previous")) {
        try {
          text = JSON.stringify({ ...JSON.parse(text), savedAt: Date.now() });
        } catch {
          continue;
        }
      }
      await writeFile(path.join(target, file), text);
    }
  }
}
