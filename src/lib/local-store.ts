"use client";

import { useSyncExternalStore } from "react";
import type { SavedKey } from "./saved-shape";

/** Where a value is safe: on the computer too, in this browser only, or nowhere yet. */
export type SaveStatus = "checking" | "saving" | "saved" | "browser-only" | "unsaved";

export interface StoreOptions<T> {
  /** Fixes a stored value that fails the check (e.g. drops bad entries) instead of discarding it all. */
  repair?: (value: unknown) => T | undefined;
  /** A cache that can be rebuilt: emptied first when the browser's storage is full. */
  cache?: boolean;
  /** Also keep a copy on the computer (when it runs there; see api/saved), so the value survives another port or browser. */
  saveTo?: SavedKey;
  /** Joins this browser's copy and the computer's when neither is known to be newer. */
  merge?: (browser: T, computer: T) => T;
}

// Rebuildable caches, dropped when there's no room for the things that matter.
const caches = new Set<string>();

function isQuotaError(error: unknown) {
  return error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

/** Writes to localStorage; when it's full, drops the caches and tries once more. False if it still can't. */
function write(key: string, text: string): boolean {
  try {
    localStorage.setItem(key, text);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) return false;
    for (const cache of caches) {
      if (cache === key) continue;
      try {
        localStorage.removeItem(cache);
      } catch {
        // Blocked storage: nothing to free.
      }
    }
    try {
      localStorage.setItem(key, text);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * A value saved in this browser's localStorage that every component reading it
 * sees change at once (and other tabs too). Falls back to `empty` when storage
 * is blocked or holds something unexpected. With `saveTo`, a copy is also kept
 * on the computer and the newer of the two wins when the page opens.
 */
export function createLocalStore<T>(key: string, empty: T, isValid: (value: unknown) => value is T, options: StoreOptions<T> = {}) {
  const { repair, saveTo, merge } = options;
  if (options.cache) caches.add(key);
  const listeners = new Set<() => void>();
  let cached: T | undefined;

  const parse = (value: unknown): T | undefined => (isValid(value) ? value : repair?.(value));

  function get(): T {
    if (cached !== undefined) return cached;
    try {
      const raw = localStorage.getItem(key);
      cached = raw === null ? empty : (parse(JSON.parse(raw)) ?? empty);
    } catch {
      cached = empty;
    }
    return cached;
  }

  const notify = () => listeners.forEach((listener) => listener());

  // --- The computer's copy -----------------------------------------------------

  const savedAtKey = `${key}:saved-at`;
  let status: SaveStatus = saveTo ? "checking" : "browser-only";
  const statusListeners = new Set<() => void>();
  let browserOk = true;
  let computer: boolean | undefined; // Whether this server keeps copies; unknown until asked.
  let pulled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingAt: number | undefined;

  function setStatus(next: SaveStatus) {
    if (status === next) return;
    status = next;
    statusListeners.forEach((listener) => listener());
  }
  const settle = () => setStatus(computer ? "saved" : browserOk ? "browser-only" : "unsaved");

  function readSavedAt(): number | undefined {
    try {
      const at = Number(localStorage.getItem(savedAtKey));
      return at > 0 ? at : undefined;
    } catch {
      return undefined;
    }
  }

  /** Takes the computer's copy (or a merge) as this browser's. */
  function adopt(value: T, at: number) {
    cached = value;
    browserOk = write(key, JSON.stringify(value));
    write(savedAtKey, String(at));
    notify();
  }

  async function send(at: number, keepalive = false) {
    pendingAt = undefined;
    try {
      const res = await fetch(`/api/saved/${saveTo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedAt: at, value: get() }),
        keepalive,
      });
      if (res.status === 404) computer = false;
      else if (res.ok) {
        computer = true;
        const doc = (await res.json()) as { stale?: boolean; savedAt?: number; value?: unknown };
        const newer = doc.stale && typeof doc.savedAt === "number" ? parse(doc.value) : undefined;
        if (newer !== undefined) adopt(newer, doc.savedAt!);
      }
      if (!res.ok && res.status !== 404) setStatus(browserOk ? "browser-only" : "unsaved");
      else settle();
    } catch {
      setStatus(browserOk ? "browser-only" : "unsaved");
    }
  }

  /** Sends the current value to the computer shortly (changes in quick succession go as one). */
  function upload(at: number) {
    if (!saveTo || computer === false) return settle();
    setStatus("saving");
    pendingAt = at;
    clearTimeout(timer);
    timer = setTimeout(() => void send(at), 250);
  }

  /** Once per page: compares this browser's copy with the computer's and keeps the newer. */
  async function pull() {
    pulled = true;
    // Leaving the page with a change still waiting: send it on the way out.
    window.addEventListener("pagehide", () => {
      if (pendingAt === undefined) return;
      clearTimeout(timer);
      void send(pendingAt, JSON.stringify(get()).length < 60_000);
    });
    try {
      const res = await fetch(`/api/saved/${saveTo}`, { cache: "no-store" });
      if (res.status === 404) {
        computer = false;
        return settle();
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      computer = true;
      const doc = (await res.json()) as { savedAt?: number; value?: unknown };
      const saved = doc.value == null ? undefined : parse(doc.value);
      const savedAt = typeof doc.savedAt === "number" ? doc.savedAt : 0;
      const local = get();
      const localAt = readSavedAt();
      const hasLocal = JSON.stringify(local) !== JSON.stringify(empty);

      if (saved === undefined || savedAt === 0) return hasLocal ? upload(localAt ?? Date.now()) : settle();
      if (localAt === undefined) {
        // This browser's copy predates dated copies: keep everything from both.
        if (hasLocal && merge) {
          const at = Date.now();
          adopt(merge(local, saved), at);
          return upload(at);
        }
        adopt(saved, savedAt);
        return settle();
      }
      if (savedAt > localAt) adopt(saved, savedAt);
      else if (localAt > savedAt) return upload(localAt);
      settle();
    } catch {
      setStatus(browserOk ? "browser-only" : "unsaved");
    }
  }

  // --- Reading and writing -----------------------------------------------------

  /** Saves a new value. False when this browser couldn't store it (the computer may still have it). */
  function set(value: T): boolean {
    cached = value;
    browserOk = write(key, JSON.stringify(value));
    if (saveTo) {
      const at = Date.now();
      write(savedAtKey, String(at));
      upload(at);
    }
    notify();
    return browserOk;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (saveTo && !pulled) void pull();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      cached = undefined;
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, get, () => empty);
  }

  function subscribeStatus(listener: () => void) {
    statusListeners.add(listener);
    if (saveTo && !pulled) void pull();
    return () => statusListeners.delete(listener);
  }

  /** Where the value is kept right now, for a save indicator. */
  function useStatus(): SaveStatus {
    return useSyncExternalStore(subscribeStatus, () => status, () => "checking");
  }

  return { get, set, useValue, useStatus };
}

const noSubscribe = () => () => {};

/** False during the server render and hydration, so pages don't flash their empty state. */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
