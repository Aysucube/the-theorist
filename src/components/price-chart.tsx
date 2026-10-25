import { formatDate, formatUsd } from "@/lib/format";
import { usdInPhp, type UsdRate } from "@/lib/fx";
import type { PricePoint } from "@/lib/trends/types";

const UP = "#10b981";
const DOWN = "#f43f5e";

function scale(points: PricePoint[], width: number, height: number, pad: number) {
  const values = points.map((p) => p.usd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return points.map((p, i) => ({
    ...p,
    x: pad + (points.length === 1 ? (width - pad * 2) / 2 : (i / (points.length - 1)) * (width - pad * 2)),
    y: pad + (1 - (p.usd - min) / span) * (height - pad * 2),
  }));
}

/** A tiny price line: green if it ended higher than it started, red if lower. Prices read in pesos with a rate. */
export function Sparkline({ points, width = 120, height = 32, rate }: { points: PricePoint[]; width?: number; height?: number; rate?: UsdRate | null }) {
  if (points.length < 2) return null;
  const scaled = scale(points, width, height, 3);
  const color = points.at(-1)!.usd >= points[0].usd ? UP : DOWN;
  const line = scaled.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Price from ${usdInPhp(points[0].usd, rate)} to ${usdInPhp(points.at(-1)!.usd, rate)} over ${points.length} days`}
      className="block max-w-full"
    >
      <polyline points={`${scaled[0].x},${height} ${line} ${scaled.at(-1)!.x},${height}`} fill={color} fillOpacity={0.12} stroke="none" />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={scaled.at(-1)!.x} cy={scaled.at(-1)!.y} r={2.2} fill={color} />
    </svg>
  );
}

/** A full price chart: every saved day as a point (hover for its price), with the range labelled, in pesos with a rate. */
export function PriceChart({ points, height = 180, rate }: { points: PricePoint[]; height?: number; rate?: UsdRate | null }) {
  if (points.length < 2) return <p className="text-xs text-muted">Not enough days saved for a chart yet.</p>;
  const width = 600;
  const scaled = scale(points, width, height, 24);
  const color = points.at(-1)!.usd >= points[0].usd ? UP : DOWN;
  const values = points.map((p) => p.usd);
  const high = Math.max(...values);
  const low = Math.min(...values);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price history" className="h-auto w-full">
      <line x1={24} x2={width - 24} y1={24} y2={24} className="stroke-line" strokeDasharray="3 4" />
      <line x1={24} x2={width - 24} y1={height - 24} y2={height - 24} className="stroke-line" strokeDasharray="3 4" />
      <text x={24} y={16} fontSize={11} className="fill-muted">
        high {usdInPhp(high, rate)}
      </text>
      <text x={24} y={height - 8} fontSize={11} className="fill-muted">
        low {usdInPhp(low, rate)}
      </text>
      <text x={width - 24} y={height - 8} fontSize={11} textAnchor="end" className="fill-muted">
        {formatDate(points[0].date)} – {formatDate(points.at(-1)!.date)}
      </text>
      <polyline points={scaled.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
      {scaled.map((p) => (
        <circle key={p.date} cx={p.x} cy={p.y} r={4} fill={color} className="opacity-70 hover:opacity-100">
          <title>
            {formatDate(p.date)}: {usdInPhp(p.usd, rate)}
            {rate ? ` (${formatUsd(p.usd)})` : ""}
          </title>
        </circle>
      ))}
    </svg>
  );
}
