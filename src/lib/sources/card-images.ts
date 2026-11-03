// Scryfall's images come from one server in the US, and from the Philippines
// about half of all new connections to it hang for 21 seconds before failing, so
// a browser asking for it directly sits waiting on dead connections. Our server
// fetches them instead: it starts another try every couple of seconds rather
// than waiting for a dead one, and keeps what it gets on disk. Images never
// change at a given address (a new scan gets a new version number), so each one
// is only ever fetched once.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { SourceError, USER_AGENT } from "./http";
import { dataDir } from "@/lib/data-dir";

const SOURCE = "Scryfall images";
const HOST = "https://cards.scryfall.io";
/** What an image's address looks like; nothing else gets fetched, so this can't be used to reach other sites. */
const IMAGE_PATH = /^(?:small|normal|large|png|art_crop|border_crop)\/(?:front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]+\.(?:jpg|png)$/;

/** A healthy answer starts within a second or so, so anything slower gets a second chance alongside it. */
const NEXT_TRY_MS = 1_500;
const TRIES = 5;
const TIMEOUT_MS = 10_000;

const DIR = dataDir("images");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The first of several staggered tries to answer; the rest are called off. */
async function download(url: string): Promise<Uint8Array> {
  const done = new AbortController();
  const signal = AbortSignal.any([done.signal, AbortSignal.timeout(TIMEOUT_MS)]);
  const attempt = async (turn: number) => {
    if (turn > 0) {
      await sleep(turn * NEXT_TRY_MS);
      signal.throwIfAborted();
    }
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal, cache: "no-store" });
    if (!res.ok) throw new SourceError(SOURCE, `HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  try {
    return await Promise.any(Array.from({ length: TRIES }, (_, turn) => attempt(turn)));
  } catch {
    throw new SourceError(SOURCE, "no answer");
  } finally {
    done.abort();
  }
}

/** Fails quietly: a host with no disk to write to just fetches it again next time. */
async function keep(file: string, bytes: Uint8Array) {
  try {
    await mkdir(DIR, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, file);
  } catch {}
}

/** A card image by its path on Scryfall's server and its query (the version number), or null if that's no image address. */
export async function getCardImage(imagePath: string, query: string): Promise<Uint8Array | null> {
  if (!IMAGE_PATH.test(imagePath)) return null;
  const version = query.match(/^\?(\d+)/)?.[1];
  const file = dataDir("images", `${imagePath.replaceAll("/", "-")}${version ? `.${version}` : ""}`);
  const saved = await readFile(file).catch(() => null);
  if (saved) return saved;

  const bytes = await download(`${HOST}/${imagePath}${version ? `?${version}` : ""}`);
  await keep(file, bytes);
  return bytes;
}
