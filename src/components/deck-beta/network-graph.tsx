"use client";

import { useId, useMemo, useState } from "react";
import { layoutNetwork } from "@/lib/deck-beta/force-layout";
import { scryfallImageAs } from "@/lib/scryfall-images";

export interface GraphNode {
  id: string;
  label: string;
  /** center: the deck's commander or the card in focus; hub: a playstyle; result: what a combo does; ghost: a card the deck lacks. */
  kind: "center" | "hub" | "card" | "result" | "ghost";
  /** 0 = middle, then rings outward. */
  ring: number;
  radius: number;
  /** Where on its ring it belongs, in radians. */
  angle?: number;
  /** Stay exactly at `angle`. */
  pinned?: boolean;
  imageUrl?: string;
  color?: string;
  /** Extra line under the label, e.g. "14 cards". */
  sublabel?: string;
  /** Drawn faintly (e.g. cards with no links). */
  faint?: boolean;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  color: string;
  width?: number;
  dashed?: boolean;
  /** Signals travel along it, from source to target. */
  pulse?: boolean;
  strength?: number;
  /** Seconds before it draws in (and starts pulsing), to animate chains in order. */
  delay?: number;
  title?: string;
}

const KIND_FILL: Record<GraphNode["kind"], string> = {
  center: "#f59e0b",
  hub: "#7c3aed",
  card: "#52525b",
  result: "#10b981",
  ghost: "#a1a1aa",
};

/**
 * An animated network of cards: links draw in, nodes pop in, and signals
 * pulse along links like a neural network. Hovering a node lights up its
 * connections; clicking (or Enter) calls onNodeClick.
 */
export function NetworkGraph({
  nodes,
  links,
  width = 960,
  height = 660,
  label,
  showAllLabels = false,
  highlight,
  onNodeClick,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  width?: number;
  height?: number;
  label: string;
  showAllLabels?: boolean;
  /** Node ids to keep bright while everything else dims (e.g. one combo's pieces). */
  highlight?: Set<string>;
  onNodeClick?: (id: string) => void;
}) {
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<string | null>(null);

  const positions = useMemo(
    () =>
      layoutNetwork(
        nodes.map((n) => ({ id: n.id, ring: n.ring, radius: n.radius, angle: n.angle, pinned: n.pinned })),
        links.map((l) => ({ source: l.source, target: l.target, strength: l.strength })),
        { width, height },
      ),
    [nodes, links, width, height],
  );

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of links) {
      map.set(l.source, (map.get(l.source) ?? new Set()).add(l.target));
      map.set(l.target, (map.get(l.target) ?? new Set()).add(l.source));
    }
    return map;
  }, [links]);

  // What stays bright: the hovered node and its neighbours, else the highlight, else everything.
  const lit = hover ? new Set([hover, ...(neighbors.get(hover) ?? [])]) : highlight;
  const isLit = (id: string) => !lit || lit.has(id);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label} className="h-auto w-full select-none">
      <defs>
        {nodes.map((n, i) => (
          <clipPath key={n.id} id={`${prefix}-clip-${i}`}>
            <circle r={n.radius} />
          </clipPath>
        ))}
      </defs>

      <g>
        {links.map((l) => {
          const a = positions.get(l.source);
          const b = positions.get(l.target);
          if (!a || !b) return null;
          // A gentle curve, so parallel links don't sit on top of each other.
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const bend = 0.12;
          const d = `M ${a.x} ${a.y} Q ${mx - (b.y - a.y) * bend} ${my + (b.x - a.x) * bend} ${b.x} ${b.y}`;
          const bright = isLit(l.source) && isLit(l.target);
          const delay = `${l.delay ?? 0}s`;
          return (
            <g key={l.id} style={{ opacity: bright ? 1 : 0.08, transition: "opacity 200ms" }}>
              {l.title && <title>{l.title}</title>}
              <path
                d={d}
                fill="none"
                stroke={l.color}
                strokeWidth={l.width ?? 1.2}
                strokeOpacity={0.55}
                strokeLinecap="round"
                pathLength={1}
                className={l.dashed ? undefined : "net-link"}
                strokeDasharray={l.dashed ? "0.012 0.012" : undefined}
                style={{ animationDelay: delay }}
              />
              {l.pulse && (
                <path
                  d={d}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={(l.width ?? 1.2) + 2}
                  strokeLinecap="round"
                  pathLength={100}
                  className="net-pulse"
                  style={{ animationDelay: delay }}
                />
              )}
            </g>
          );
        })}
      </g>

      <g>
        {nodes.map((n, i) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const color = n.color ?? KIND_FILL[n.kind];
          const image = n.imageUrl ? (scryfallImageAs(n.imageUrl, "art_crop") ?? n.imageUrl) : undefined;
          const bright = isLit(n.id);
          const showLabel = showAllLabels || n.kind !== "card" || hover === n.id || (highlight?.has(n.id) ?? false);
          const clickable = Boolean(onNodeClick) && n.kind !== "hub" && n.kind !== "result";
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y})`} style={{ opacity: bright ? (n.faint ? 0.45 : 1) : 0.15, transition: "opacity 200ms" }}>
              <g
                className="net-node"
                style={{ animationDelay: `${Math.min(1.2, n.ring * 0.25 + (i % 12) * 0.03)}s`, cursor: clickable ? "pointer" : "default" }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                onClick={clickable ? () => onNodeClick?.(n.id) : undefined}
                onKeyDown={clickable ? (e) => e.key === "Enter" && onNodeClick?.(n.id) : undefined}
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? "button" : undefined}
                aria-label={clickable ? `${n.label}: open its synergy map` : n.label}
              >
                {n.kind !== "card" && <circle r={n.radius + 7} fill={color} className="net-glow" opacity={0.3} />}
                <circle
                  r={n.radius}
                  fill={n.kind === "hub" || n.kind === "result" ? color : "#18181b"}
                  stroke={color}
                  strokeWidth={n.kind === "center" ? 4 : 2}
                  strokeDasharray={n.kind === "ghost" ? "4 3" : undefined}
                />
                {image && (
                  <image
                    href={image}
                    x={-n.radius}
                    y={-n.radius}
                    width={n.radius * 2}
                    height={n.radius * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#${prefix}-clip-${i})`}
                    opacity={n.kind === "ghost" ? 0.45 : 1}
                  />
                )}
                {(n.kind === "hub" || n.kind === "result") && (
                  <text textAnchor="middle" dy="0.35em" fontSize={n.radius > 24 ? 11 : 9} fontWeight={700} fill="#fff">
                    {shorten(n.label, n.radius > 24 ? 14 : 11)}
                  </text>
                )}
                {showLabel && n.kind !== "hub" && n.kind !== "result" && (
                  <text
                    y={n.radius + 13}
                    textAnchor="middle"
                    fontSize={n.kind === "center" ? 13 : 10.5}
                    fontWeight={n.kind === "center" ? 700 : 500}
                    className="fill-zinc-800 dark:fill-zinc-100"
                    paintOrder="stroke"
                    stroke="var(--background)"
                    strokeWidth={3}
                  >
                    {shorten(n.label, n.kind === "center" ? 32 : 22)}
                  </text>
                )}
                {n.sublabel && (n.kind === "hub" || n.kind === "result") && (
                  <text
                    y={n.radius + 13}
                    textAnchor="middle"
                    fontSize={10}
                    className="fill-zinc-600 dark:fill-zinc-400"
                    paintOrder="stroke"
                    stroke="var(--background)"
                    strokeWidth={3}
                  >
                    {n.sublabel}
                  </text>
                )}
                <title>{n.sublabel ? `${n.label} (${n.sublabel})` : n.label}</title>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function shorten(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
