// Builds the desktop app: the site as a standalone server (desktop/server), then
// the installer for this computer's system with electron-builder (desktop/dist).
//   npm run desktop                 server and installer
//   npm run desktop -- --server     the server only, for `npm --prefix desktop start`
// Other arguments go to electron-builder, e.g. `npm run desktop -- --dir` for an unpacked app.
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const desktop = path.resolve(import.meta.dirname, "..");
const root = path.resolve(desktop, "..");
const args = process.argv.slice(2);
const run = (command, cwd, env = {}) =>
  execSync(command, { cwd, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env } });

run("npx next build", root, { THEORIST_DESKTOP: "1" });

const built = path.join(root, "desktop-build");
const server = path.join(desktop, "server");
// Personal data must never ship: a .data folder in the build means tracing took in the whole project.
for (const leak of [".data", "desktop", "src"]) {
  if (existsSync(path.join(built, "standalone", leak))) {
    throw new Error(`The standalone server took in ${leak}/ (file tracing reached the whole project). Not packaging it.`);
  }
}
rmSync(server, { recursive: true, force: true });
cpSync(path.join(built, "standalone"), server, { recursive: true });
// The standalone server leaves the browser's files and the public folder to whoever ships it.
cpSync(path.join(built, "static"), path.join(server, "desktop-build", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(server, "public"), { recursive: true });
// Tracing brings the cache handler's test file along with it.
rmSync(path.join(server, "cache-handlers", "remote.test.ts"), { force: true });
console.log(`Server ready in ${server}`);

if (!args.includes("--server")) {
  if (!existsSync(path.join(desktop, "node_modules", "electron-builder"))) run("npm ci --no-audit --no-fund", desktop);
  run(`npx electron-builder ${args.join(" ")}`, desktop);
}
