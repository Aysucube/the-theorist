// Re-downloads the real TCGph and EDHREC pages the tests read from.
// Run `npm run fixtures:update`, then `npm test`: if a site changed its markup
// or JSON, the tests fail here instead of the app quietly showing wrong data.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "sources", "__fixtures__");
const USER_AGENT = "CommanderPH/0.1 (MTG Commander price lookup for PH players)";

const FIXTURES = [
  // A heavily reprinted card: its card page continues on ?page=2.
  ["tcgph/sol-ring.html", "https://tcgph.com/card/sol-ring", "text/html"],
  ["tcgph/sol-ring-page-2.html", "https://tcgph.com/card/sol-ring?page=2", "text/html"],
  // A double-faced commander that fits on one page.
  [
    "tcgph/esika-god-of-the-tree-the-prismatic-bridge.html",
    "https://tcgph.com/card/esika-god-of-the-tree-the-prismatic-bridge",
    "text/html",
  ],
  // TCGph answers unknown slugs with a 200 page that has no card on it.
  ["tcgph/unknown-card.html", "https://tcgph.com/card/not-a-real-card-xyz", "text/html"],

  ["edhrec/cards-sol-ring.json", "https://json.edhrec.com/pages/cards/sol-ring.json", "application/json"],
  [
    "edhrec/commanders-atraxa-praetors-voice.json",
    "https://json.edhrec.com/pages/commanders/atraxa-praetors-voice.json",
    "application/json",
  ],
  // A partial name EDHREC redirects to the full card ("fire" -> "fire-ice").
  ["edhrec/cards-redirect.json", "https://json.edhrec.com/pages/cards/fire.json", "application/json"],

  // Scryfall's suggestions for a partial name, including loose matches like "Heat Ray".
  [
    "scryfall/autocomplete-atra.json",
    "https://api.scryfall.com/cards/autocomplete?q=atra",
    "application/json",
  ],
];

// TCGph pages carry anonymous session tokens; keep them out of the repo.
function redactTokens(html) {
  return html
    .replace(/(name="csrf-token" content=")[^"]*/g, "$1REDACTED")
    .replace(/(data-phx-(?:session|static)=")[^"]*/g, "$1REDACTED");
}

for (const [file, url, accept] of FIXTURES) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const path = join(ROOT, file);
  await mkdir(dirname(path), { recursive: true });
  const body = await res.text();
  await writeFile(path, file.endsWith(".html") ? redactTokens(body) : body);
  console.log(`saved ${file}`);
  // Be polite: these sites have no official API.
  await new Promise((r) => setTimeout(r, 500));
}
