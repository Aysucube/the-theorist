"use client";

import { CURVE_LABELS, type CurveReport } from "@/lib/deck-beta/curve";
import { formatCount } from "@/lib/format";
import { curveAdvice, CurveChart, curveSource } from "./template-bits";

/** One thing the deck is counting: what it has, and what it wants. */
export interface Gauge {
  label: string;
  have: number;
  aim?: number;
  /** Of `have`, how many are at the mana value picked. */
  at?: number;
  about?: string;
  /** Fixed for a thing that has a color of its own; otherwise it turns amber when it's over. */
  color?: string;
}

/**
 * The deck at a glance: its mana curve, card types and template, in a panel that
 * follows you down the page. A cost picked on the curve filters the whole page,
 * and the rest of the panel shows how much of each is at that cost.
 */
export function DeckPanel({ curve, cost, onCost, types, template, className = "" }: { curve: CurveReport; cost?: number; onCost: (slot: number) => void; types: Gauge[]; template: Gauge[]; className?: string }) {
  return (
    <aside aria-label="This deck at a glance" className={`surface flex flex-col gap-5 p-4 ${className}`}>
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">Mana curve</h3>
          {cost !== undefined && (
            <button type="button" onClick={() => onCost(cost)} className="link text-xs text-muted">
              Show all costs
            </button>
          )}
        </div>
        <p className="mb-7 text-xs text-muted">Dashes mark {curveSource(curve)}. Click a cost to filter this page.</p>
        <CurveChart curve={curve} side picked={cost} onPick={onCost} />
        <p className="mt-3 text-xs text-muted tabular-nums">
          {curve.spells > 0 && (
            <>
              Average <span className={curve.topHeavy ? "text-amber-400" : "text-foreground"}>{curve.average.toFixed(2)}</span> / {curve.averageTarget.toFixed(2)} ·{" "}
            </>
          )}
          <span className="text-foreground">{formatCount(curve.early)}</span> / {curve.earlyTarget} plays at 2 or less
        </p>
        <p className="mt-1 text-xs text-muted">{curveAdvice(curve)}</p>
      </section>
      <Gauges title="Card types" rows={types} cost={cost} />
      <Gauges title="The template" rows={template} cost={cost} />
    </aside>
  );
}

/** A group of gauges, with a column for the cost picked when there is one. */
function Gauges({ title, rows, cost }: { title: string; rows: Gauge[]; cost?: number }) {
  if (rows.length === 0) return null;
  const top = Math.max(1, ...rows.map((row) => Math.max(row.have, row.aim ?? 0)));
  const picked = cost !== undefined;
  const columns = `grid items-center gap-2 ${picked ? "grid-cols-[7.5rem_1fr_1.5rem_2.75rem]" : "grid-cols-[7.5rem_1fr_2.75rem]"}`;
  return (
    <section>
      <div className={`${columns} mb-1.5`}>
        <h3 className="eyebrow col-span-2">{title}</h3>
        {picked && (
          <>
            <span className="text-right text-[11px] font-medium text-accent tabular-nums">{CURVE_LABELS[cost]}</span>
            <span className="text-right text-[11px] text-muted">All</span>
          </>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const over = !row.color && row.aim !== undefined && row.have > row.aim;
          const tone = over ? "bg-amber-400/80" : row.color ? "" : "bg-accent/80";
          return (
            <li key={row.label} title={row.about} className={`${columns} text-xs`}>
              <span className="truncate text-foreground/85">{row.label}</span>
              <span className="relative block h-1.5 rounded-full bg-subtle">
                <span className={`absolute inset-0 origin-left rounded-full transition-[transform,opacity] duration-300 ease-out ${tone} ${picked ? "opacity-30" : ""}`} style={{ transform: `scaleX(${row.have / top})`, background: row.color }} />
                {picked && <span className={`absolute inset-0 origin-left rounded-full transition-transform duration-300 ease-out ${tone}`} style={{ transform: `scaleX(${(row.at ?? 0) / top})`, background: row.color }} />}
                {row.aim !== undefined && <span aria-hidden className="absolute -inset-y-0.5 -ml-px border-l-2 border-dashed border-foreground/60" style={{ left: `${(row.aim / top) * 100}%` }} />}
              </span>
              {picked && <span className="text-right font-semibold text-accent tabular-nums">{formatCount(row.at ?? 0)}</span>}
              <span className="text-right tabular-nums">
                {formatCount(row.have)}
                {row.aim !== undefined && <span className="text-muted">/{formatCount(row.aim)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
