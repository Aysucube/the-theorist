"use client";

import type { TypeMove, TypeRow } from "@/lib/builder/card-types";
import { formatCount } from "@/lib/format";
import type { CardDetails } from "@/lib/types";
import { PickGrid } from "../builder/build-card";
import { CardName } from "./template-bits";

const share = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");

function gapOf({ have, aim }: TypeRow): string {
  if (aim === undefined) return "";
  if (have === aim) return "On target";
  return have > aim ? `${formatCount(have - aim)} over` : `${formatCount(aim - have)} short`;
}

/**
 * A deck's card types against the average deck for its commander on EDHREC: a
 * bar for each type with a tick at what to aim for, in cards and as a share of
 * the deck, then what would bring the two together.
 */
export function TypeRatio({ rows, moves, owned, onAdd, onRemove }: { rows: TypeRow[]; moves: TypeMove[]; owned: (name: string) => number; onAdd: (card: CardDetails) => void; onRemove: (name: string) => void }) {
  const total = rows.reduce((sum, row) => sum + row.have, 0);
  const aimed = rows.reduce((sum, row) => sum + (row.aim ?? 0), 0);
  const top = Math.max(1, ...rows.map((row) => Math.max(row.have, row.aim ?? 0)));
  const compared = rows.some((row) => row.aim !== undefined);
  return (
    <div className="flex flex-col gap-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="pb-1.5 pr-2 sm:pr-3 text-left font-normal">
              Type
            </th>
            <th scope="col" className="w-full pb-1.5 pr-2 sm:pr-3 font-normal">
              <span className="sr-only">Compared</span>
            </th>
            <th scope="col" className="pb-1.5 pr-2 sm:pr-3 text-right font-normal">
              Yours
            </th>
            {compared && (
              <>
                <th scope="col" className="pb-1.5 pr-2 sm:pr-3 text-right font-normal">
                  Suggested
                </th>
                <th scope="col" className="pb-1.5 font-normal">
                  <span className="sr-only">Difference</span>
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.type} className="border-t border-line">
              <th scope="row" className="py-1.5 pr-2 sm:pr-3 text-left font-normal whitespace-nowrap text-foreground/85">
                {row.type}
              </th>
              <td className="py-1.5 pr-2 sm:pr-3">
                <span className="relative block h-2 min-w-12 rounded-full bg-subtle">
                  <span
                    className={`block h-full origin-left rounded-full transition-transform duration-300 ease-out ${row.aim !== undefined && row.have > row.aim ? "bg-amber-400/80" : "bg-accent/80"}`}
                    style={{ transform: `scaleX(${row.have / top})` }}
                  />
                  {row.aim !== undefined && <span aria-hidden className="absolute -inset-y-1 -ml-px border-l-2 border-dashed border-foreground/60" style={{ left: `${(row.aim / top) * 100}%` }} />}
                </span>
              </td>
              <td className="py-1.5 pr-2 sm:pr-3 text-right whitespace-nowrap tabular-nums">
                <span className="font-semibold">{formatCount(row.have)}</span> <span className="text-xs text-muted">{share(row.have, total)}</span>
              </td>
              {compared && (
                <>
                  <td className="py-1.5 pr-2 sm:pr-3 text-right whitespace-nowrap tabular-nums">
                    {row.aim === undefined ? (
                      "–"
                    ) : (
                      <>
                        <span className="font-semibold">{formatCount(row.aim)}</span> <span className="text-xs text-muted">{share(row.aim, aimed)}</span>
                      </>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-xs whitespace-nowrap text-muted">{gapOf(row)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <Moves moves={moves} owned={owned} onAdd={onAdd} onRemove={onRemove} />
    </div>
  );
}

/** For each thing a deck has too few of, cards to add; for each it has too many of, cuts. */
export function Moves({ moves, owned, onAdd, onRemove }: { moves: TypeMove[]; owned: (name: string) => number; onAdd: (card: CardDetails) => void; onRemove: (name: string) => void }) {
  return moves.map((move) =>
    move.over < 0 ? (
      <PickGrid key={move.type} title={`${move.type}: ${formatCount(-move.over)} short`} picks={move.picks} owned={owned} onAdd={onAdd} />
    ) : (
      <div key={move.type}>
        <h4 className="text-sm font-semibold">
          {move.type}: {formatCount(move.over)} over
        </h4>
        <p className="mb-2 text-xs text-muted">The ones these decks play least.</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-2">
          {move.cuts.map((cut) => (
            <li key={cut.card.name} className="flex items-center gap-1">
              <CardName name={cut.card.name} />
              <span className="text-xs text-muted tabular-nums">{cut.why}</span>
              <button type="button" onClick={() => onRemove(cut.card.name)} aria-label={`Remove ${cut.card.name} from the deck`} className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-foreground">
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    ),
  );
}
