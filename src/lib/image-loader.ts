// Loads card images in the browser with retries. Scryfall's image server
// sometimes stalls for 20+ seconds from PH connections, so a stalled or failed
// attempt is abandoned and retried rather than leaving a blank card.
import { sleep } from "./retry";

/** Waits before each retry of an image. */
export const IMAGE_RETRY_WAITS_MS = [2_000, 4_000, 8_000, 15_000, 30_000];
/** Give up on one attempt after this long; stalled connections otherwise hang ~21s. */
const ATTEMPT_TIMEOUT_MS = 12_000;

/** Resolves true once the image has loaded, false if it errored or timed out. */
function loadOnce(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = ""; // cancel the stalled download
      resolve(false);
    }, ATTEMPT_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = src;
  });
}

/** The image URL for a given attempt; a fresh query string makes the browser really ask again. */
export function attemptUrl(url: string, attempt: number): string {
  if (attempt === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;
}

/** Loads an image, retrying with waits. Resolves to the URL that loaded, or null if every try failed. */
export async function loadImageWithRetry(
  url: string,
  {
    load = loadOnce,
    wait = sleep,
    onWait,
  }: {
    load?: (src: string) => Promise<boolean>;
    wait?: (ms: number) => Promise<void>;
    onWait?: (waitMs: number, attempt: number) => void;
  } = {},
): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    const src = attemptUrl(url, attempt);
    if (await load(src)) return src;
    if (attempt >= IMAGE_RETRY_WAITS_MS.length) return null;
    const waitMs = IMAGE_RETRY_WAITS_MS[attempt];
    onWait?.(waitMs, attempt + 1);
    await wait(waitMs);
  }
}

/** Where one image's download stands. */
export interface ImageStatus {
  /** The URL that loaded, once it has. */
  src?: string;
  /** Seconds until the next try, while waiting. */
  retryIn?: number;
  /** Which try is coming up (1 = the first retry). */
  attempt?: number;
  failed?: boolean;
}

const NOT_STARTED: ImageStatus = {};

interface Entry {
  status: ImageStatus;
  listeners: Set<() => void>;
}

// One entry per image this visit. Downloads keep going after a hover card
// closes, and every hover card showing the image sees the same live status.
const entries = new Map<string, Entry>();

function set(entry: Entry, status: ImageStatus) {
  entry.status = status;
  entry.listeners.forEach((notify) => notify());
}

function start(url: string, entry: Entry) {
  set(entry, NOT_STARTED);
  void loadImageWithRetry(url, {
    onWait: (ms, attempt) => set(entry, { retryIn: Math.round(ms / 1000), attempt }),
  }).then((src) => set(entry, src ? { src } : { failed: true }));
}

/**
 * For useSyncExternalStore: starts the download on first subscribe, and
 * starts over when a new hover card subscribes after every try had failed.
 */
export function subscribeImage(url: string, notify: () => void): () => void {
  let entry = entries.get(url);
  if (!entry) {
    entry = { status: NOT_STARTED, listeners: new Set() };
    entries.set(url, entry);
    start(url, entry);
  } else if (entry.status.failed) {
    start(url, entry);
  }
  const e = entry;
  e.listeners.add(notify);
  return () => e.listeners.delete(notify);
}

/** For useSyncExternalStore: the same object until something changes. */
export function getImageStatus(url: string): ImageStatus {
  return entries.get(url)?.status ?? NOT_STARTED;
}
