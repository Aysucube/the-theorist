// The app's own server: the Next.js site, built standalone, run in a separate
// process on this computer only (127.0.0.1), with its output kept in a log for
// bug reports.
import { utilityProcess } from "electron";
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { pickPort } from "./ports.mjs";

/** The log starts over (keeping the last one) beyond this. */
const LOG_BYTES = 5 * 1024 * 1024;
/** A first start on a slow computer can take a while; past this, something is wrong. */
const START_TIMEOUT_MS = 90_000;

function openLog(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  try {
    if (existsSync(file) && statSync(file).size > LOG_BYTES) renameSync(file, file.replace(/\.log$/, ".old.log"));
  } catch {}
  const log = createWriteStream(file, { flags: "a" });
  log.write(`\n=== ${new Date().toISOString()} ===\n`);
  return log;
}

/** Resolves once the server answers at all (any reply means it's listening). */
async function waitUntilUp(url, stopped) {
  const until = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < until) {
    if (stopped()) throw new Error("The app's server stopped while starting.");
    try {
      await fetch(`${url}/icon.svg`, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`The app's server didn't start within ${START_TIMEOUT_MS / 1000} seconds.`);
}

/**
 * Starts the server and resolves with its address once it answers.
 * `onExit` hears about it stopping on its own later (not through stop()).
 */
export async function startServer({ serverDir, dataDir, logFile, port: wanted, onExit }) {
  const port = wanted ?? (await pickPort());
  const log = openLog(logFile);
  const child = utilityProcess.fork(path.join(serverDir, "server.js"), [], {
    cwd: serverDir,
    stdio: "pipe",
    serviceName: "The Theorist server",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      THEORIST_DATA_DIR: dataDir,
      THEORIST_SAVE_ON_COMPUTER: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  child.stdout?.on("data", (chunk) => log.write(chunk));
  child.stderr?.on("data", (chunk) => log.write(chunk));

  let stopping = false;
  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    log.write(`\n[server stopped, code ${code}]\n`);
    if (!stopping) onExit?.(code);
  });

  const url = `http://127.0.0.1:${port}`;
  try {
    await waitUntilUp(url, () => exited);
  } catch (error) {
    stopping = true;
    child.kill();
    throw error;
  }
  return {
    url,
    port,
    stop() {
      stopping = true;
      child.kill();
    },
  };
}
