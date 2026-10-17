import { formatCount, formatPhp } from "@/lib/format";
import { tcgphSlug } from "@/lib/slugs";
import { cheapestFirst, getPrices } from "@/lib/sources/tcgph";
import type { ScryfallCard, TcgphPrice } from "@/lib/types";
import { Panel, SourceMessage } from "./panel";

const TITLE = "Philippine store prices";
const SHOWN = 15;

export async function TcgphPanel({ card }: { card: ScryfallCard }) {
  let prices;
  try {
    prices = await getPrices(tcgphSlug(card.name));
  } catch {
    return (
      <Panel title={TITLE} source="TCGph">
        <SourceMessage>Couldn’t reach TCGph right now. Try again in a bit.</SourceMessage>
      </Panel>
    );
  }

  if (!prices) {
    return (
      <Panel title={TITLE} source="TCGph">
        <SourceMessage>TCGph doesn’t list this card.</SourceMessage>
      </Panel>
    );
  }

  const rows = cheapestFirst(prices);
  if (rows.length === 0) {
    return (
      <Panel title={TITLE} source="TCGph" sourceUrl={prices.url}>
        <SourceMessage>No Philippine store has this card in stock right now.</SourceMessage>
      </Panel>
    );
  }

  const [top, rest] = [rows.slice(0, SHOWN), rows.slice(SHOWN)];
  const stores = new Set(rows.map((r) => r.listing.store)).size;

  return (
    <Panel title={TITLE} source="TCGph" sourceUrl={prices.url}>
      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Cheapest" value={formatPhp(rows[0].listing.pricePhp)} />
        <Stat label="Stores" value={formatCount(stores)} />
        <Stat label="Listings" value={formatCount(rows.length)} />
      </dl>

      <ListingTable rows={top} />
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-amber-700 dark:text-amber-400">
            Show {rest.length} more
          </summary>
          <ListingTable rows={rest} />
        </details>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function ListingTable({ rows }: { rows: TcgphPrice[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2 pr-3 font-medium">Price</th>
            <th className="py-2 pr-3 font-medium">Store</th>
            <th className="py-2 pr-3 font-medium">Printing</th>
            <th className="py-2 pr-3 font-medium">Cond.</th>
            <th className="py-2 pr-3 text-right font-medium">Qty</th>
            <th className="py-2 font-medium">
              <span className="sr-only">Link</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ print, listing }) => (
            <tr
              key={listing.listingId}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
            >
              <td className="py-2 pr-3 font-semibold tabular-nums">
                {formatPhp(listing.pricePhp)}
              </td>
              <td className="py-2 pr-3">{listing.store}</td>
              <td className="py-2 pr-3">
                <a href={print.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {print.setName}
                </a>
                <span className="block text-xs text-zinc-500">
                  {[print.setCode && `${print.setCode} #${print.collectorNumber}`, print.finish, print.language]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </td>
              <td className="py-2 pr-3" title={listing.conditionLabel}>
                {listing.condition}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{listing.quantity ?? "–"}</td>
              <td className="py-2 text-right">
                <a
                  href={listing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap text-amber-700 hover:underline dark:text-amber-400"
                >
                  Store ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
