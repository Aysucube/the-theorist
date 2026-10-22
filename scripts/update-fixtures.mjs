// Re-downloads the real TCGph and EDHREC pages the tests read from.
// Run `npm run fixtures:update`, then `npm test`: if a site changed its markup
// or JSON, the tests fail here instead of the app quietly showing wrong data.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "sources", "__fixtures__");
const USER_AGENT = "TheTheorist/0.1 (MTG Commander deck and price tool for PH players)";

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
  // One playstyle of a commander, with synergy for that playstyle.
  [
    "edhrec/commanders-atraxa-praetors-voice-infect.json",
    "https://json.edhrec.com/pages/commanders/atraxa-praetors-voice/infect.json",
    "application/json",
  ],
  // Every deck theme, and one theme's commanders and cards.
  ["edhrec/tags.json", "https://json.edhrec.com/pages/tags.json", "application/json"],
  ["edhrec/tags-tokens.json", "https://json.edhrec.com/pages/tags/tokens.json", "application/json"],
  // A partial name EDHREC redirects to the full card ("fire" -> "fire-ice").
  ["edhrec/cards-redirect.json", "https://json.edhrec.com/pages/cards/fire.json", "application/json"],

  // Every paper printing of Sol Ring (one page of Scryfall search results).
  [
    "scryfall/prints-sol-ring.json",
    "https://api.scryfall.com/cards/search?q=oracleid%3A6ad8011d-3471-4369-9d68-b264cc027487%20game%3Apaper&unique=prints&order=released",
    "application/json",
  ],
  // A card's official rulings, as Scryfall publishes them.
  ["scryfall/rulings-doubling-season.json", "https://api.scryfall.com/cards/fdn/216/rulings", "application/json"],
  // Commander Spellbook's combos for a small Atraxa deck (sent as a POST with this deck).
  [
    "spellbook/find-my-combos-atraxa.json",
    "https://backend.commanderspellbook.com/find-my-combos",
    "application/json",
    {
      commanders: [{ card: "Atraxa, Praetors' Voice" }],
      main: ["Sol Ring", "Walking Ballista", "Heliod, Sun-Crowned", "Basalt Monolith", "Rings of Brighthearth", "Devoted Druid", "Vizier of Remedies"].map((card) => ({ card })),
    },
  ],
  // Commander Spellbook's bracket estimate for a deck with Game Changers, land denial, an extra turn and combos.
  [
    "spellbook/estimate-bracket-lathril.json",
    "https://backend.commanderspellbook.com/estimate-bracket",
    "application/json",
    {
      commanders: [{ card: "Lathril, Blade of the Elves" }],
      main: ["Elvish Archdruid", "Priest of Titania", "Staff of Domination", "Umbral Mantle", "Rhystic Study", "Demonic Tutor", "Thassa's Oracle", "Demonic Consultation", "Armageddon", "Time Warp", "Sol Ring"].map((card) => ({ card })),
    },
  ],
  // The Commander Game Changers list, as Scryfall marks it.
  [
    "scryfall/search-game-changers.json",
    "https://api.scryfall.com/cards/search?q=is%3Agamechanger&unique=cards&order=name",
    "application/json",
  ],
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

for (const [file, url, accept, json] of FIXTURES) {
  const res = await fetch(url, {
    method: json ? "POST" : "GET",
    headers: { "User-Agent": USER_AGENT, Accept: accept, ...(json ? { "Content-Type": "application/json" } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const path = join(ROOT, file);
  await mkdir(dirname(path), { recursive: true });
  const body = await res.text();
  await writeFile(path, file.endsWith(".html") ? redactTokens(body) : body);
  console.log(`saved ${file}`);
  // Be polite: these sites have no official API.
  await new Promise((r) => setTimeout(r, 500));
}
