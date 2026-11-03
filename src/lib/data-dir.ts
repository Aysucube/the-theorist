// Where the app keeps its files on the computer: the .data folder beside it, or
// the folder the desktop app gives it (THEORIST_DATA_DIR), since an installed
// app's own folder may be read-only and is replaced on every update.
import path from "node:path";

export function dataDir(...parts: string[]): string {
  // Both ignored by the build's file tracing, which would otherwise copy the data (or the whole project) into a standalone server.
  const base = process.env.THEORIST_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
  return path.join(/*turbopackIgnore: true*/ base, ...parts);
}
