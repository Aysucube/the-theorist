import { formatCount, formatPhp } from "@/lib/format";
import { pricePrintings, type PricedPrinting } from "@/lib/printings";
import { scryfallImageAs } from "@/lib/scryfall-images";
import { tcgphSlug } from "@/lib/slugs";
import { reportSourceError } from "@/lib/sources/http";
import { getPrintings } from "@/lib/sources/scryfall";
import { getPrices } from "@/lib/sources/tcgph";
import type { Printing, ScryfallCard, TcgphPrices } from "@/lib/types";
import { Panel, SourceMessage } from "./panel";
import { PrintingGrid, type PrintingTile } from "./printing-grid";

const TITLE = "Printings";

export async function PrintingsPanel({ card }: { card: ScryfallCard }) {
  // Both lookups are cached; the TCGph one is shared with the store prices panel.
  const [printings, prices] = await Promise.all([
    card.oracleId
      ? getPrintings(card.oracleId).catch((e) => {
          reportSourceError("PrintingsPanel", e);
          return null;
        })
      : Promise.resolve([] as Printing[]),
    getPrices(tcgphSlug(card.name)).catch((e): TcgphPrices | null | undefined => {
      reportSourceError("PrintingsPanel", e);
      return undefined;
    }),
  ]);

  if (printings === null && prices === undefined) {
    return (
      <Panel title={TITLE} source="Scryfall + TCGph">
        <SourceMessage>Couldn’t load printings right now. Try again in a bit.</SourceMessage>
      </Panel>
    );
  }

  const { inStock, notInStock } = pricePrintings(printings ?? [], prices ?? null);
  const total = inStock.length + notInStock.length;
  const cheapest = inStock[0];

  return (
    <Panel title={TITLE} source="Scryfall + TCGph">
      <p className="mb-4 text-sm text-muted">
        {formatCount(total)} {total === 1 ? "printing" : "printings"} ·{" "}
        {formatCount(inStock.length)} in stock at PH stores
        {cheapest && (
          <>
            {" "}
            · cheapest is{" "}
            <strong>
              {cheapest.setName} ({cheapest.setCode} #{cheapest.collectorNumber})
            </strong>{" "}
            at <strong>{formatPhp(cheapest.cheapest!.pricePhp)}</strong>
          </>
        )}
        {printings === null && " · couldn’t reach Scryfall, so only in-stock printings are listed"}
        {prices === undefined && " · couldn’t reach TCGph, so prices are missing"}
        . Click a printing to see it at the top of the page; click its price to buy it on TCGph.
      </p>

      {inStock.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-medium">In stock, cheapest first</h3>
          <PrintingGrid tiles={inStock.map(toTile)} label="in-stock printings" cardName={card.name} />
        </>
      )}

      {notInStock.length > 0 && (
        <details className="mt-4" open={inStock.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">
            Not in PH stores right now ({formatCount(notInStock.length)})
          </summary>
          <div className="mt-2">
            <PrintingGrid tiles={notInStock.map(toTile)} label="printings" cardName={card.name} />
          </div>
        </details>
      )}
    </Panel>
  );
}

/** Trims a printing to what its tile shows, to keep the page small. */
function toTile(p: PricedPrinting): PrintingTile {
  return {
    key: p.key,
    setCode: p.setCode,
    setName: p.setName,
    collectorNumber: p.collectorNumber,
    year: p.releasedAt?.slice(0, 4),
    imageUrl: p.imageUrl,
    // Scryfall images come in every size; TCGph's only in one.
    largeImageUrl: scryfallImageAs(p.imageUrl, "normal") ?? p.imageUrl,
    artUrl: scryfallImageAs(p.imageUrl, "art_crop"),
    href: p.tcgphUrl ?? p.scryfallUrl,
    pricePhp: p.cheapest?.pricePhp,
    store: p.cheapest?.store,
    finish: p.cheapest?.finish,
  };
}
