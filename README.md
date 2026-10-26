# The Theorist

A Magic: The Gathering Commander tool for Filipino players. Search a card and see, on one page:

- **Scryfall**: the card, its rules text and Commander legality
- **EDHREC**: how often Commander decks play it, and for commanders, recommended cards
- **TCGph**: what it costs right now at Philippine game stores, in pesos

Each card page also shows its **official rulings** and lists **every printing** with the cheapest PH copy of each,
and hovering any card link shows a quick preview (artwork, cheapest price, shop). Cards on the Commander
**Game Changers** list carry a small red "Game Changer" label everywhere in the app.

On the front page, **browse by deck theme** (Tokens, Aristocrats, Landfall and 400 more):
see the commanders most often built around a theme on EDHREC, and the cards those decks play.

Then collect cards on the **Shopping** page (or paste a list from Moxfield or Archidekt), price
them all, and get a **shopping list** that uses the fewest stores possible,
with a ready-to-send order message for each store. Prices always use the cheapest
printing of a card, whatever printing your list names.

The **Binder** holds your collection. Paste a list (`4 Llanowar Elves`, a Moxfield or Archidekt
export) or upload a CSV from a collection app such as ManaBox, Deckbox or Dragon Shield; any CSV
with a name column and a count column works. Add to what's there or replace it, change counts
card by card, and filter by color, type or commanders.

### How decks are judged

Decks are built and judged by one set of rules, drawn from deckbuilding guides (The Command
Zone's template and videos on mana curves and mana bases):

- **The template** for a 100-card deck: 10 to 12 **ramp**, 12 **card advantage** (cards that net
  extra cards, not just selection), 12 **targeted disruption** (removal and counterspells), 6 **mass
  disruption** (board wipes, fogs, taxes) and about 30 cards for its **plan** (enablers, payoffs and
  enhancers for what the deck does). The categories add up to more than 99 on purpose: the best
  cards fill two at once, and those carry a **Flexible** tag (the only tag cards get).
- **The mana curve**: spells by mana value against a low, wide curve (about 3 mana on average, 4
  in 10 spells at 2 or less), so there's something to cast every turn from the start and two
  spells a turn soon after. Upgrades put **cheap ramp and card advantage first** to secure it, and
  expensive cards that do no job are suggested as cuts.
- **Lands by the curve**: 38 for a mid-range deck, 33 to 35 for a low curve, 39 or 40 for a high
  one.
- **The mana base by colors**: mostly basics and room for 8 to 10 utility lands in one color;
  untapped duals, fetches and a couple of bounce lands in two; more fixing, triomes and lands that
  tap for any color in three or more. Lands that always enter tapped rank down (a basic is often
  better), and ramp at 2 mana or less beats three-mana rocks.
- **The commander's game plan**: what it rewards and makes (a payoff wants enablers, an enabler
  wants payoffs, one that's both wants protecting), how players build it (its most popular
  playstyles on EDHREC, with their share of decks, and its decks' curve and creature count), what
  the 99 should hold, and **EDHREC's articles about it** (deck techs, budget builds, upgrade
  guides) for more.

**Create Commander Deck** builds a deck from the binder, one step at a time:

1. **Commander**: every commander in your binder, filtered by color (including, exactly or within
   those colors) or by name, or any commander at all if you'd rather.
2. **Bracket**: the bracket you're building for (1 to 5), with how EDHREC's decks for the
   commander split across them.
3. **Synergies**: the commander's **game plan**, then EDHREC's cards for it, highest synergy and new
   cards first, and its playstyles to lean into. Cards you don't own are grayed out throughout.
4. **Lands**: how many to run by the curve of the commander's decks on EDHREC, the mana base its
   colors want, and how the basics split across the colors by the deck's mana symbols.
5. **Build**: recommendations that change with every card you add: **Next up**, the **Curve**
   (cheap ramp and card advantage), the **Template** categories it's short of, **Flexible** cards,
   combos a card away that fit the bracket, the chosen playstyle, lands for its colors and cards
   from your binder, your own cards first if you like. The deck comes together beside it: its
   commander, a count to 100, the template's meters, its mana curve, its bracket, and the newest
   cards on a stack.
6. **Finish**: name it and save it. Basic lands fill the rest of the mana base.

A deck in progress is saved as you go, so you can leave and continue later. Saved decks go to
**My Decks**, each shown by its commander with its name and how many cards you'd need to buy.
**Click one to open its page**: everything below, for that deck, with every change saved to it.
Right-click it (or use its ⋯ button) to add **only the cards missing from your binder** to
Shopping, copy it, or delete it.

**Where the binder is saved.** The binder and My Decks are kept in your browser and, when you
open The Theorist from its launcher (or `npm run dev`), in files on your computer too
(`.data/saved/binder.json` and `decks.json`, each with the previous version beside it). Browsers
keep storage per address, port included, and the launcher moves to the next port when 3000 is
busy, so without the computer's copy the binder could look empty after a restart. Now whichever
port or browser opens the app gets the newest copy; an older browser copy is merged in rather than
lost. The binder page says where it's saved, and **Download a backup** saves it as a CSV that the
import box reads back. If the browser's storage fills up, rebuildable caches are cleared first so
the binder still fits.

### A deck's page

Each deck in My Decks has its own page. Beside its name it shows the deck's **Commander Bracket**,
such as "Bracket 2 nearing 3": worked out from its Game Changers, mass land denial, extra turns and
combos (rated by Commander Spellbook), following Wizards of the Coast's October 2025 bracket rules.

- **Overview**: the commander's game plan and how many of the deck's cards serve it; the template's
  meters (open one for its cards); the mana curve; the mana base (basics, other lands, utility
  lands, lands that enter tapped, slow rocks); the most flexible cards; the bracket, with what it
  takes to reach the one you pick; then upgrades from EDHREC's decks for the commander that fit
  that bracket (securing the curve first, then each category it's short of, flexible picks,
  stronger cards for higher brackets and lands for its colors); combos a card away; and cuts for a
  lower curve. Read from rules text and EDHREC's data, so treat it as a guide.
- **Synergies**: the deck as an animated network, with the commander in the middle as its card
  turning in 3D, over a dimmed land in the commander's colors. The deck's playstyles (Elves,
  Tokens, Aristocrats...) sit around it, every card linked to the playstyles it feeds or rewards,
  and combos running as coloured chains through their pieces. Cards that would complete a combo
  sit outside as shaded nodes you can add. Click a combo to walk through how it works, step by
  step. **3D sphere** turns the map into a Dyson sphere: the commander is the star at the center,
  each playstyle a station on the shell, and cards that link to nothing orbit further out.
- **Combos**: the combos the deck has and the ones a card away (from
  [Commander Spellbook](https://commanderspellbook.com)), plus the combos EDHREC lists for the
  commander, each with its steps and an add button for every missing card, and how consistently
  the deck assembles one, from shuffling the deck 4,000 times.
- **Playstyle**: what the deck is built around now, and, for any of the commander's playstyles
  on EDHREC, the highest-synergy cards to add and the deck's cards those decks rarely play.
- **Cards**: a gallery. Click a card for what it interacts with; double-click it for its own
  network of synergies and combos with your commander, its rulings and recommendations.

**Check a Deck** (My Decks → "Check a pasted list") does all of this for any pasted list without
saving it. Under **Saved decks and sharing** there, save it to My Decks, or copy the deck as a code
(`TT1.…`, the whole deck and its commander in one line), a link, or a plain list for Moxfield and
Archidekt. Paste a code into "Paste a deck list" on any copy of The Theorist to load it. Codes are
made and read in the browser; no deck is sent to a server to share it.

On a deck's page, **Add to Shopping** puts only the cards you don't own into the Shopping list,
so you can price them in Philippine stores: copies in your binder are taken off (own 1 of a card the
deck runs 2 of, and 1 goes on the list), and basic lands are left out unless you ask. Nothing else
changes the Shopping list.

The look is themed on **Jace Beleren, the Theorist**: always midnight navy, with moonlit text and
mind-blue light on whatever is active. The graphics are original: a sigil (rune rings around a
diamond "mind's eye") and a faint thought lattice behind every page. On phones the sections move
to a tab bar along the bottom.

Things move with purpose, briefly, using strong ease-out curves:

- **Between pages**, the page slides left as you go forward (right along the nav, or deeper) and
  right as you come back, while the header stays put. A front-page tile's icon and title morph
  into the header of the page it opens. These use the browser's View Transitions (React's
  `<ViewTransition>`); browsers without them just change page.
- **Opening a feature** makes it pop in: panels as their data arrives, each tab's content (the
  lit tab pill glides across), disclosures, popovers, the card preview and menus.
- **Main actions** (Add to binder, Continue, Price this list) send a ring of light from where you
  pressed.

Animations only move, scale and fade, so they stay smooth. They're switched off when the system
asks for reduced motion.

## Running it on a Windows computer (no setup)

Anyone with Windows 10 or 11 and an internet connection can run the app from
GitHub's ZIP. Nothing needs installing first.

1. On the GitHub page, click **Code → Download ZIP**.
2. Right-click the downloaded ZIP, choose **Properties**, tick **Unblock**
   and click **OK**. That stops Windows warning about every file. Then
   right-click it again and choose **Extract All**.
3. Open the extracted folder and double-click **Start The Theorist.cmd**. If
   Windows says it protected your PC, click **More info**, then **Run anyway**.
4. The first start takes about 5 to 10 minutes. If the computer has no
   Node.js, the launcher downloads a private copy from nodejs.org into the
   folder (it checks nodejs.org's published checksum first). Then it installs
   the app's packages and builds it. Later starts take a few seconds.
5. Your browser opens the app. Keep the black window open while you use it,
   and close it to stop the app. If Windows Firewall asks about Node.js, you
   can click **Cancel**. Allow it only if you want phones on the same Wi-Fi to
   use the app through the "Network" address the window shows.

The app uses port 3000, or the next free port if another program has it. To
remove everything, delete the folder.

## Running it on a Mac (no setup)

Anyone with macOS 11 (Big Sur) or newer and an internet connection can run the
app. Nothing needs installing first, and it works on Apple silicon and Intel Macs.

1. Get the ZIP (**The Theorist for Mac.zip**, or **Code → Download ZIP** on
   the GitHub page) and double-click it in Finder to unzip it. Move the
   unzipped folder somewhere permanent, such as Documents.
2. Open the folder and double-click **Start The Theorist.command**. The first
   time, macOS won't open it because it isn't from the App Store or an
   identified developer:
   - **macOS 15 (Sequoia) or newer**: click **Done**, open **System Settings →
     Privacy & Security**, scroll down to the message about "Start The
     Theorist.command" and click **Open Anyway**, then enter your password.
   - **Older macOS**: right-click (or Control-click) the file, choose
     **Open**, then click **Open**.

   macOS remembers this, so later double-clicks just work. If it still won't
   open, start it from Terminal instead: type `bash ` (with a space), drag the
   file into the Terminal window, and press Return.
3. The first start takes about 5 to 10 minutes. If the Mac has no Node.js, the
   launcher downloads a private copy from nodejs.org into the folder (it checks
   nodejs.org's published checksum first). Then it installs the app's packages
   and builds it. Later starts take a few seconds.
4. Your browser opens the app. Keep the Terminal window open while you use it,
   and close it (or press Control-C) to stop the app. If macOS asks whether
   "node" may accept incoming network connections, click **Deny**. Allow it
   only if you want phones on the same Wi-Fi to use the app.

The app uses port 3000, or the next free port if another program has it. To
remove everything, move the folder to the Trash.

To make the Mac ZIP from this repository, run
`git -c core.autocrlf=false archive --format=zip --prefix="The Theorist/" -o "The Theorist for Mac.zip" HEAD`.
It keeps the launcher's permission to run, which a ZIP made with Windows
Explorer loses (macOS then refuses to start it).

On Linux, install [Node.js](https://nodejs.org) 20.9 or newer, then run
`npm ci`, `npm run build` and `npm start` in the folder.

## Running it locally (developers)

Needs Node.js 20.9 or newer.

```bash
npm ci
npm run dev        # http://localhost:3000
```

Other scripts:

| Command                   | What it does                                             |
| ------------------------- | -------------------------------------------------------- |
| `npm test`                | Unit tests (Vitest), offline using saved pages          |
| `npm run lint`            | ESLint                                                   |
| `npm run build`           | Production build                                         |
| `npm start`               | Serve the production build                               |
| `npm run fixtures:update` | Re-download the saved TCGph/EDHREC/Scryfall test pages   |

Run `npm run fixtures:update && npm test` now and then: if TCGph or EDHREC change
their pages, the tests fail instead of the app quietly showing wrong prices.

## Market

The **Market** tab lists cards whose market price (TCGplayer) jumped the most over the past day,
week or month, with the cheapest copy in Philippine stores. Market prices are US dollars; the app
shows them **in pesos at the day's exchange rate** (hover a price for the dollars), and so does the
"US market price" on each card page. The rate is the European Central Bank's reference rate via
[Frankfurter](https://www.frankfurter.app), updated each working day, or ExchangeRate-API's open
rate if Frankfurter can't be reached; the page names the rate, its day and its source. If neither
answers, prices stay in dollars. These are a guide to a card's value; what Philippine stores
actually charge is the TCGph price under each card. Two sources for the trends, best first:

1. **A shared daily file.** `.github/workflows/market-trends.yml` runs every day on GitHub. It
   reads MTGJSON's 90-day price history as a stream (`scripts/build-market-trends.ts`) and
   publishes `trends.json` on the `trends-data` branch. Every copy of the app reads it, but only
   while the repository is public.
2. **The app's own tracking.** Otherwise the app saves every card's price once a day from
   Scryfall's daily card file (about 25 MB) into `.data/price-history`. It compares against
   earlier days, so surges show from the second day it runs, and weekly ones after a week.

Only Commander-legal cards that cost at least $2 (about ₱127) and rose by at least 10% (and 50 cents) count.

Below them, the **price history** explorer compares any two days the app has saved and lists the
biggest rises or falls between them (by percentage or amount, above a minimum price in pesos), each with
its full set name, price line and the cheapest PH copy. **PH deals** (next to "Rank by") tracks
bargains: it checks Philippine stores for every listed card and keeps only the printings a store
sells for **at least 20% under their market price**. It compares the same printing (a non-foil copy
from the same set), so a cheaper reprint doesn't count; each deal shows the store, the price and how
far under market it is, linking to the listing. The app keeps 90 days of prices in
`.data/price-history` (one compressed file a day, about 65 MB in all), and keeps saving them even
when the shared file is used.

## Configuration

Copy `.env.example` to `.env.local` (locally) or set these in your host:

| Variable  | Required | Purpose                                                                   |
| --------- | -------- | ------------------------------------------------------------------------- |
| `APP_URL` | Recommended in production | Your site's URL, added to our User-Agent so Scryfall, EDHREC and TCGph can see who is calling |
| `TRENDS_URL` | No | Where to read the shared price-trends file; defaults to this repository's `trends-data` branch |

## How we treat the data sources

Scryfall and Commander Spellbook have official APIs. EDHREC and TCGph are read from the
same pages their own websites use, so the app is built to stay a light, polite visitor:

- Every lookup is cached: Scryfall and EDHREC for a day, TCGph prices for an hour.
- Prices are fetched only when someone asks (a "Check ₱" click or "Price this deck").
  Decks are priced one card at a time; a busy source is waited out (5s, 10s, 20s,
  30s, 30s) and retried rather than skipped.
- A card is looked up on TCGph by name first; Scryfall is only asked for the full
  name when TCGph doesn't recognise it (mostly double-faced cards).
- Scryfall calls follow its [published limits](https://scryfall.com/docs/api/rate-limits)
  (2 a second for name lookups and searches, 10 a second otherwise), and after an
  HTTP 429 the app stops calling Scryfall for 30 seconds.
- Each visitor is rate limited (`src/proxy.ts`): 60 card pages per minute,
  120 search suggestions per minute, 350 price checks per 10 minutes.
- Commander Spellbook is asked twice per deck analysis (a deck's page: its combos and its bracket
  estimate), cached for a day, plus once per combo EDHREC lists for the commander that Spellbook's
  search didn't return (up to 20, for their steps), cached for a week.
- Create Commander Deck reads the same EDHREC commander page as everything else (cached for a
  day). Card details for a binder are asked for 150 cards at a time and kept in the browser, so
  each card is looked up once.
- A commander's game plan adds one search of EDHREC's articles for its name, cached for days; its
  playstyles and curve come from the EDHREC page already read for it.
- The exchange rate is one request to Frankfurter (or ExchangeRate-API), cached for hours. Full set
  names come from Scryfall's set list, one request cached for days.
- PH deals checks prices through the same one-card-at-a-time queue as "Check ₱", and only while
  it's switched on.
- The Game Changers list comes from one Scryfall search, cached for a day on the server and in
  each browser. The land art behind the synergy networks is one Scryfall search per land, cached
  for a day, and its artist is credited on the page.
- Every request names the app in its User-Agent and gives up after 10 seconds (45 for
  Commander Spellbook, which works through every combo in a deck).

If a site asks you to stop or offers an API, follow that.

## Deploying

### Vercel (recommended)

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project**, import the repository. The defaults work.
3. Under **Settings → Environment Variables**, set `APP_URL` to the site's URL.
4. Deploy.

On Vercel, the `'use cache: remote'` caches are shared by every server instance
automatically, so a card looked up once is served from cache to everyone.

The built-in rate limits count per server instance. Vercel can run several
instances at once, so for a hard, shared cap also add rate-limit rules in
**Firewall** (for example on `/api/price` and `/card`). Rate-limit rules may
depend on your Vercel plan.

### Your own server

```bash
npm ci
npm run build
npm start          # PORT=3000 by default
```

A single Node.js process keeps the cache and rate limits in memory, which is
fine for one server. Put it behind a reverse proxy (nginx, Caddy) that sets
`X-Forwarded-For`; otherwise every visitor shares one rate-limit bucket. Running
several instances needs a shared cache handler; see Next.js's `cacheHandlers` docs.

## Limitations

- The shopping list, beta deck, saved prices and ticks live in the visitor's browser
  (localStorage, and IndexedDB for the binder's card details). The binder and My Decks are also
  saved on the computer when the app runs there (see above), never on a shared server. Nothing
  syncs between devices.
- Store totals assume a store has enough copies; TCGph only shows stock per listing.
- For decks needing more than three stores, the shopping list uses a quick
  approximation, which may not always find the fewest stores.

## Known `npm audit` warning

`npm audit` reports a high-severity issue in `braces`, pulled in by
`eslint-config-next` for linting. It only runs on developer machines and CI, never
in the deployed app (`npm audit --omit=dev` reports 0 vulnerabilities), and no
fixed version of `braces` exists yet. `npm audit fix --force` would downgrade the
lint config to an old Next.js version, so don't run it.
