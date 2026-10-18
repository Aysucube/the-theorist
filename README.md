# Commander PH

Search a Magic: The Gathering card and see, on one page:

- **Scryfall**: the card, its rules text and Commander legality
- **EDHREC**: how often Commander decks play it, and for commanders, recommended cards
- **TCGph**: what it costs right now at Philippine game stores, in pesos

Each card page also shows its **official rulings** and lists **every printing** with the cheapest PH copy of each,
and hovering any card link shows a quick preview (artwork, cheapest price, shop).

On the front page, **browse by deck theme** (Tokens, Aristocrats, Landfall and 400 more):
see the commanders most often built around a theme on EDHREC, and the cards those decks play.

Then collect cards on the **Shopping** page (or paste a list from Moxfield or Archidekt), price
them all, and get a **shopping list** that uses the fewest stores possible,
with a ready-to-send order message for each store. Prices always use the cheapest
printing of a card, whatever printing your list names.

**Deck (beta)** is a separate, early test: paste a deck to see it as a gallery,
click a card to see which of your cards it interacts with (by card type, subtype
and theme), and double-click for a synergy map with EDHREC-based recommendations
in your colors. It keeps its own deck and never changes the Shopping list.

## Running it on a Windows computer (no setup)

Anyone with Windows 10 or 11 and an internet connection can run the app from
GitHub's ZIP. Nothing needs installing first.

1. On the GitHub page, click **Code → Download ZIP**.
2. Right-click the downloaded ZIP, choose **Properties**, tick **Unblock**
   and click **OK**. That stops Windows warning about every file. Then
   right-click it again and choose **Extract All**.
3. Open the extracted folder and double-click **Start Commander PH.cmd**. If
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

On macOS or Linux, install [Node.js](https://nodejs.org) 20.9 or newer, then run
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

## Price trends

The front page lists cards whose market price (TCGplayer, in US dollars) jumped the most over the
past day, week or month, with the cheapest copy in Philippine stores. Two sources, best first:

1. **A shared daily file.** `.github/workflows/market-trends.yml` runs every day on GitHub. It
   reads MTGJSON's 90-day price history as a stream (`scripts/build-market-trends.ts`) and
   publishes `trends.json` on the `trends-data` branch. Every copy of the app reads it, but only
   while the repository is public.
2. **The app's own tracking.** Otherwise the app saves every card's price once a day from
   Scryfall's daily card file (about 25 MB) into `.data/price-history`. It compares against
   earlier days, so surges show from the second day it runs, and weekly ones after a week.

Only Commander-legal cards that cost at least $2 and rose by at least 10% (and 50 cents) count.

## Configuration

Copy `.env.example` to `.env.local` (locally) or set these in your host:

| Variable  | Required | Purpose                                                                   |
| --------- | -------- | ------------------------------------------------------------------------- |
| `APP_URL` | Recommended in production | Your site's URL, added to our User-Agent so Scryfall, EDHREC and TCGph can see who is calling |
| `TRENDS_URL` | No | Where to read the shared price-trends file; defaults to this repository's `trends-data` branch |

## How we treat the data sources

Only Scryfall has an official API. EDHREC and TCGph are read from the same pages
their own websites use, so the app is built to stay a light, polite visitor:

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
- Every request names the app in its User-Agent and gives up after 10 seconds.

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
  (localStorage). They don't sync between devices.
- Store totals assume a store has enough copies; TCGph only shows stock per listing.
- For decks needing more than three stores, the shopping list uses a quick
  approximation, which may not always find the fewest stores.

## Known `npm audit` warning

`npm audit` reports a high-severity issue in `braces`, pulled in by
`eslint-config-next` for linting. It only runs on developer machines and CI, never
in the deployed app (`npm audit --omit=dev` reports 0 vulnerabilities), and no
fixed version of `braces` exists yet. `npm audit fix --force` would downgrade the
lint config to an old Next.js version, so don't run it.
