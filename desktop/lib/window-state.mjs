// The window opens where it was last closed, at the same size.
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT = { width: 1360, height: 880 };

/** Saved bounds, if they still fit on one of the screens (`areas`: each display's work area). */
export function readWindowState(file, areas) {
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    const { x, y, width, height } = saved;
    if (![width, height].every((n) => Number.isFinite(n) && n >= 380)) return { ...DEFAULT };
    const visible =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      areas.some((a) => x + 80 > a.x && y + 40 > a.y && x + 80 < a.x + a.width && y + 40 < a.y + a.height);
    return visible ? { x, y, width, height, maximized: saved.maximized === true } : { width, height, maximized: saved.maximized === true };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveWindowState(file, window) {
  try {
    const bounds = window.getNormalBounds();
    writeFileSync(file, JSON.stringify({ ...bounds, maximized: window.isMaximized() }));
  } catch {}
}
