"use client";

import { useSyncExternalStore } from "react";

/**
 * A value saved in this browser's localStorage that every component reading it
 * sees change at once (and other tabs too). Falls back to `empty` when storage
 * is blocked or holds something unexpected.
 */
export function createLocalStore<T>(key: string, empty: T, isValid: (value: unknown) => value is T) {
  const listeners = new Set<() => void>();
  let cached: T | undefined;

  function get(): T {
    if (cached !== undefined) return cached;
    try {
      const raw = localStorage.getItem(key);
      const parsed: unknown = raw === null ? empty : JSON.parse(raw);
      cached = isValid(parsed) ? parsed : empty;
    } catch {
      cached = empty;
    }
    return cached;
  }

  function set(value: T) {
    cached = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Full or blocked storage: keep working for this visit.
    }
    listeners.forEach((notify) => notify());
  }

  function subscribe(notify: () => void) {
    listeners.add(notify);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      cached = undefined;
      notify();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(notify);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, get, () => empty);
  }

  return { get, set, useValue };
}

const noSubscribe = () => () => {};

/** False during the server render and hydration, so pages don't flash their empty state. */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
