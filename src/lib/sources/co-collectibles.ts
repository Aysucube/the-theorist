import type { TcgphPrint } from "@/lib/types";
import { SourceError, sourceFetch } from "./http";
import { storeKey, storeList, type StoreCatalog } from "./store-list";

// Co Collectibles publishes its list as one page on HeroHub, with every card in
// the page's data, so that one page is the whole list. Its prices are in pesos,
// tax included. While a store is in HeroHub's preview mode it shows every card
// it could stock and each one's quantity is 0, so the prices are real but nothing
// says it has the card. Once any quantity is above 0 the counts are live.
const STORE = "Co Collectibles";
const SHOWCASE = "https://herohub-superapp.vercel.app/showcase/HRj2NaoE3-uW/mtg";
// The page holds about 2,000 cards.
const PAGE_TIMEOUT_MS = 30_000;
/** What a lookup will wait the first time; the list is only one page. */
const PATIENCE_MS = 5_000;

/** One card as the page's data has it. */
export interface ShowcaseCard {
  sku: string;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  primaryTypes: string[];
  isFoil: boolean;
  priceIncl: number;
  quantity: number;
  grade: string | null;
}

/** The cards in the page's data, which Next.js sends as escaped text in script tags. */
export function parseShowcase(html: string): ShowcaseCard[] {
  const data = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1]) as string).join("");
  // Each card is a flat object, so its closing brace is the first one outside a string.
  return [...data.matchAll(/\{"sku":(?:[^{}"]|"(?:[^"\\]|\\.)*")*\}/g)].map((m) => JSON.parse(m[0]) as ShowcaseCard);
}

/** "Plains (0281)" and "Aerid Konstrari (Showcase) (Fracture Foil) (0417)" are a Plains and an Aerid Konstrari. */
const cardName = (name: string) => name.replace(/\s*\([^)]*\)/g, "").trim();

/** Tokens and art cards share names with real cards, or have no set or card type at all. */
const isCard = (card: ShowcaseCard) => card.setCode !== "" && card.primaryTypes.length > 0 && !/\b(?:Art Card|Token)\b/.test(card.name);

export function catalogOf(cards: ShowcaseCard[]): StoreCatalog {
  const stocked = cards.some((card) => card.quantity > 0);
  const catalog: StoreCatalog = {};
  for (const card of cards) {
    if (!isCard(card) || (stocked && card.quantity === 0)) continue;
    const print: TcgphPrint = {
      printId: `co-collectibles-${card.sku}`,
      setName: card.setName,
      setCode: card.setCode.toUpperCase(),
      collectorNumber: card.collectorNumber,
      finish: card.isFoil ? "Foil" : "Nonfoil",
      url: SHOWCASE,
      listings: [
        {
          listingId: `co-collectibles-${card.sku}`,
          store: STORE,
          condition: card.grade ?? "",
          conditionLabel: card.grade ?? (stocked ? undefined : "Stock not confirmed"),
          quantity: stocked ? card.quantity : undefined,
          pricePhp: card.priceIncl,
          url: SHOWCASE,
          unconfirmed: stocked ? undefined : true,
        },
      ],
    };
    (catalog[storeKey(cardName(card.name))] ??= []).push(print);
  }
  return catalog;
}

async function readList(): Promise<StoreCatalog> {
  const res = await sourceFetch(STORE, SHOWCASE, "text/html", undefined, PAGE_TIMEOUT_MS);
  if (!res.ok) throw new SourceError(STORE, `HTTP ${res.status}`);
  const cards = parseShowcase(await res.text());
  if (cards.length === 0) throw new SourceError(STORE, "no cards on the page");
  return catalogOf(cards);
}

export const coCollectiblesPrints = storeList("co-collectibles", readList, PATIENCE_MS);
