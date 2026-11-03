// Draws the app icon (assets/icon.png, 1024 px) from assets/icon.svg, and the site's tab icon
// (src/app/icon.svg) from the same file. electron-builder turns the PNG into the Windows and
// Mac icons. Run after changing the SVG: node desktop/scripts/make-icon.mjs
import { copyFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const desktop = path.resolve(import.meta.dirname, "..");
const svg = path.join(desktop, "assets", "icon.svg");
await sharp(svg, { density: 1024 / (200 / 72) }).resize(1024, 1024).png().toFile(path.join(desktop, "assets", "icon.png"));
copyFileSync(svg, path.join(desktop, "..", "src", "app", "icon.svg"));
console.log("icon.png and src/app/icon.svg written");
