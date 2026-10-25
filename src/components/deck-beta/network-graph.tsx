"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { layoutNetwork, type Point } from "@/lib/deck-beta/force-layout";
import { scryfallImageAs } from "@/lib/scryfall-images";
import { useCardHover } from "../card-link";
import { SpinningCard } from "./spinning-card";

export interface GraphNode {
  id: string;
  label: string;
  /** center: the commander or the card in focus; hub: a playstyle; result: what a combo does; ghost: a card the deck lacks. */
  kind: "center" | "hub" | "card" | "result" | "ghost";
  /** 0 = middle, then rings outward. */
  ring: number;
  /** Its size in the layout (space kept around it). */
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

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How big a node grows when it's hovered, selected or part of a walkthrough step. */
const EXPANDED = 24;
const ZOOM_MS = 450;

const dotRadius = (n: GraphNode) =>
  n.kind === "center" ? Math.max(20, n.radius * 0.6) : n.kind === "hub" ? 6 : n.kind === "result" ? 7 : n.kind === "ghost" ? 8 : Math.max(5, n.radius * 0.5);

/**
 * A minimalist, interactive network of cards. Cards are small dots that grow
 * to show their art on hover; signals pulse along the links. Click a node to
 * select it (and light up its links), double-click to open it, drag nodes to
 * move them, drag the background to pan, and zoom with the buttons or
 * Ctrl + scroll. Give `focus` some node ids to glide the view onto them.
 * With `previewOf`, resting the mouse on a card shows its hover preview;
 * `flagOf` puts a small label on a node, such as "GC" for a Game Changer.
 * A center node with a picture is drawn as its card turning in 3D. Drawn for
 * a dark background (see LandBackdrop).
 */
export function NetworkGraph({
  nodes,
  links,
  width = 960,
  height = 660,
  label,
  showAllLabels = false,
  highlight,
  activeLinks,
  focus,
  selected,
  onSelect,
  onOpen,
  previewOf,
  flagOf,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  width?: number;
  height?: number;
  label: string;
  showAllLabels?: boolean;
  /** Node ids to keep bright (and show big) while everything else dims, e.g. a walkthrough step's cards. */
  highlight?: Set<string>;
  /** Link ids to draw boldly, e.g. a combo's chain. */
  activeLinks?: Set<string>;
  /** Node ids to zoom onto; empty or missing shows everything. */
  focus?: string[];
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onOpen?: (id: string) => void;
  /** The card to show a hover preview of for a node, if it's a card. */
  previewOf?: (node: GraphNode) => string | undefined;
  /** A short label to pin on a node, if any. */
  flagOf?: (node: GraphNode) => string | undefined;
}) {
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const cardHover = useCardHover();
  const [moved, setMoved] = useState<Record<string, Point>>({});
  const full: View = useMemo(() => ({ x: 0, y: 0, w: width, h: height }), [width, height]);
  const [view, setView] = useState<View>(full);
  // The view right now, for handlers and animations (state lags a frame behind).
  const viewNow = useRef<View>(full);
  const animation = useRef<number | undefined>(undefined);
  const drag = useRef<
    | { kind: "pan"; startX: number; startY: number; from: View; moved: boolean }
    | { kind: "node"; id: string; startX: number; startY: number; from: Point; moved: boolean }
    | null
  >(null);

  const layout = useMemo(
    () =>
      layoutNetwork(
        nodes.map((n) => ({ id: n.id, ring: n.ring, radius: n.radius, angle: n.angle, pinned: n.pinned })),
        links.map((l) => ({ source: l.source, target: l.target, strength: l.strength })),
        { width, height },
      ),
    [nodes, links, width, height],
  );
  const pos = (id: string) => moved[id] ?? layout.get(id);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of links) {
      map.set(l.source, (map.get(l.source) ?? new Set()).add(l.target));
      map.set(l.target, (map.get(l.target) ?? new Set()).add(l.source));
    }
    return map;
  }, [links]);

  function setViewNow(next: View) {
    viewNow.current = next;
    setView(next);
  }

  function animateTo(target: View) {
    if (animation.current) cancelAnimationFrame(animation.current);
    const start = viewNow.current;
    const begun = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - begun) / ZOOM_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      setViewNow({
        x: start.x + (target.x - start.x) * e,
        y: start.y + (target.y - start.y) * e,
        w: start.w + (target.w - start.w) * e,
        h: start.h + (target.h - start.h) * e,
      });
      if (t < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  }

  // The view to glide to: the focused nodes with room around them (same shape as the picture), or everything.
  const focusKey = focus?.join("\n") ?? "";
  const target = useMemo((): View => {
    const points = (focus ?? []).map((id) => moved[id] ?? layout.get(id)).filter((p): p is Point => Boolean(p));
    if (points.length === 0) return full;
    const pad = 90;
    const minX = Math.min(...points.map((p) => p.x)) - pad;
    const maxX = Math.max(...points.map((p) => p.x)) + pad;
    const minY = Math.min(...points.map((p) => p.y)) - pad;
    const maxY = Math.max(...points.map((p) => p.y)) + pad;
    const aspect = width / height;
    let w = Math.max(maxX - minX, (maxY - minY) * aspect, width * 0.35);
    let h = w / aspect;
    w = Math.min(w, width);
    h = Math.min(h, height);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return { x: Math.min(Math.max(0, cx - w / 2), width - w), y: Math.min(Math.max(0, cy - h / 2), height - h), w, h };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, layout, full]);

  useEffect(() => {
    animateTo(target);
    // Only when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Ctrl/⌘ + scroll zooms around the pointer; plain scrolling still scrolls the page.
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      const v = viewNow.current;
      const factor = Math.exp(e.deltaY * 0.002);
      const w = Math.min(width, Math.max(width * 0.15, v.w * factor));
      const h = (w / v.w) * v.h;
      const px = v.x + ((e.clientX - rect.left) / rect.width) * v.w;
      const py = v.y + ((e.clientY - rect.top) / rect.height) * v.h;
      setViewNow({ x: px - ((px - v.x) / v.w) * w, y: py - ((py - v.y) / v.h) * h, w, h });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [width]);

  useEffect(() => () => {
    if (animation.current) cancelAnimationFrame(animation.current);
  }, []);

  function zoomBy(factor: number) {
    const v = viewNow.current;
    const w = Math.min(width, Math.max(width * 0.15, v.w * factor));
    const h = (w / v.w) * v.h;
    animateTo({ x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h });
  }

  // Pointer units → picture units.
  const unit = () => viewNow.current.w / (svg.current?.getBoundingClientRect().width || width);

  function onBackgroundDown(e: ReactPointerEvent) {
    drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, from: viewNow.current, moved: false };
    svg.current?.setPointerCapture(e.pointerId);
  }
  function onNodeDown(e: ReactPointerEvent, id: string) {
    e.stopPropagation();
    const from = pos(id);
    if (!from) return;
    drag.current = { kind: "node", id, startX: e.clientX, startY: e.clientY, from, moved: false };
    svg.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const u = unit();
    if (d.kind === "pan") {
      setViewNow({ ...d.from, x: d.from.x - dx * u, y: d.from.y - dy * u });
    } else {
      const id = d.id;
      setMoved((m) => ({ ...m, [id]: { x: d.from.x + dx * u, y: d.from.y + dy * u } }));
    }
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    if (d.kind === "node") onSelect?.(d.id === selected ? null : d.id);
    else onSelect?.(null);
  }

  // What stays bright: the hovered node and its neighbours, else the selected one's, else the highlight, else everything.
  const lit =
    hover ? new Set([hover, ...(neighbors.get(hover) ?? [])])
    : selected ? new Set([selected, ...(neighbors.get(selected) ?? [])])
    : highlight;
  const isLit = (id: string) => !lit || lit.has(id);
  const isBig = (n: GraphNode) => n.kind !== "hub" && n.kind !== "result" && (hover === n.id || selected === n.id || (highlight?.has(n.id) ?? false));

  // The center node's card, turning in 3D over the network (it sits above the SVG, so it follows the view by hand).
  const spinning = nodes.find((n) => n.kind === "center" && n.imageUrl);
  const spinAt = spinning ? pos(spinning.id) : undefined;
  const spinWidth = spinning ? dotRadius(spinning) * 3.4 : 0;

  const zoomed = view.w < width - 1;
  const button =
    "flex size-8 items-center justify-center rounded-lg border border-line-strong bg-surface/90 text-sm text-foreground backdrop-blur shadow-sm hover:border-accent";

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="group"
        aria-label={label}
        className="h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
      >
        <defs>
          {nodes.map((n, i) => (
            <clipPath key={n.id} id={`${prefix}-clip-${i}`}>
              <circle r={n.kind === "center" ? dotRadius(n) : EXPANDED} />
            </clipPath>
          ))}
        </defs>
        <rect x={-width} y={-height} width={width * 3} height={height * 3} fill="transparent" onPointerDown={onBackgroundDown} />

        <g>
          {links.map((l) => {
            const a = pos(l.source);
            const b = pos(l.target);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const d = `M ${a.x} ${a.y} Q ${mx - (b.y - a.y) * 0.1} ${my + (b.x - a.x) * 0.1} ${b.x} ${b.y}`;
            const active = activeLinks?.has(l.id) ?? false;
            const bright = active || (isLit(l.source) && isLit(l.target));
            const w = (l.width ?? 1) * (active ? 2 : 0.8);
            return (
              <g key={l.id} style={{ opacity: bright ? 1 : 0.06, transition: "opacity 200ms" }} pointerEvents="none">
                {l.title && <title>{l.title}</title>}
                <path
                  d={d}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={w}
                  strokeOpacity={active ? 0.95 : 0.4}
                  strokeLinecap="round"
                  pathLength={1}
                  className={l.dashed ? undefined : "net-link"}
                  strokeDasharray={l.dashed ? "0.015 0.015" : undefined}
                  style={{ animationDelay: `${l.delay ?? 0}s` }}
                />
                {(l.pulse || active) && (
                  <path
                    d={d}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={w + (active ? 2.5 : 1.5)}
                    strokeLinecap="round"
                    pathLength={100}
                    className="net-pulse"
                    style={{ animationDelay: `${active ? 0 : (l.delay ?? 0)}s`, animationDuration: active ? "1.4s" : undefined }}
                  />
                )}
              </g>
            );
          })}
        </g>

        <g>
          {nodes.map((n, i) => {
            const p = pos(n.id);
            if (!p) return null;
            const color = n.color ?? "#8d9bb8";
            const big = isBig(n);
            const r = dotRadius(n);
            const image = n.imageUrl ? (scryfallImageAs(n.imageUrl, "art_crop") ?? n.imageUrl) : undefined;
            const showLabel = n.kind === "center" || n.kind === "hub" || n.kind === "result" || big || showAllLabels;
            // Under the turning card for the center; under the dot for the rest.
            const labelY = n === spinning ? spinWidth * 0.75 + 12 : (big ? EXPANDED : r) + (n.kind === "hub" ? 12 : 13);
            const card = previewOf?.(n);
            const flag = flagOf?.(n);
            const edge = big ? EXPANDED : r;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                style={{ opacity: isLit(n.id) ? (n.faint ? 0.5 : 1) : 0.15, transition: "opacity 200ms" }}
              >
                <g
                  className="net-node"
                  style={{ animationDelay: `${Math.min(1, n.ring * 0.2 + (i % 15) * 0.025)}s`, cursor: "pointer" }}
                  onPointerDown={(e) => {
                    cardHover.hide();
                    onNodeDown(e, n.id);
                  }}
                  onPointerEnter={(e) => {
                    setHover(n.id);
                    if (card && e.pointerType === "mouse" && !drag.current) {
                      cardHover.show(card, e.currentTarget, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
                    }
                  }}
                  onPointerLeave={() => {
                    setHover(null);
                    cardHover.hide();
                  }}
                  onDoubleClick={() => {
                    cardHover.hide();
                    onOpen?.(n.id);
                  }}
                  onFocus={(e) => {
                    setHover(n.id);
                    if (card) cardHover.show(card, e.currentTarget, e.currentTarget.getBoundingClientRect());
                  }}
                  onBlur={() => {
                    setHover(null);
                    cardHover.hide();
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (selected === n.id) onOpen?.(n.id);
                    else onSelect?.(n.id);
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected === n.id}
                  aria-label={`${n.label}${n.sublabel ? `, ${n.sublabel}` : ""}`}
                >
                  {/* A wider invisible target, so small dots are easy to hit. */}
                  <circle r={Math.max(r, 12)} fill="transparent" />
                  {n.kind === "result" ? (
                    <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" fill={color} rx={2} />
                  ) : n.kind === "hub" ? (
                    <>
                      <circle r={r + 5} fill={color} opacity={0.18} className="net-glow" />
                      <circle r={r} fill={color} />
                    </>
                  ) : n.kind === "ghost" ? (
                    <>
                      <circle r={r} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.5} strokeDasharray="3 2" />
                      <text textAnchor="middle" dy="0.35em" fontSize={10} fontWeight={700} fill={color}>
                        +
                      </text>
                    </>
                  ) : n.kind === "center" && n === spinning ? null : n.kind === "center" ? (
                    <>
                      <circle r={r + 3} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />
                      {image ? (
                        <image href={image} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${prefix}-clip-${i})`} />
                      ) : (
                        <circle r={r} fill={color} />
                      )}
                    </>
                  ) : (
                    <circle r={r} className="fill-[#0b1222]" stroke={color} strokeWidth={1.75} />
                  )}

                  {big && n.kind !== "center" && (
                    <g className="net-node" style={{ animationDuration: "180ms" }}>
                      <circle r={EXPANDED + 2} className="fill-[#060a14]" stroke={color} strokeWidth={2} strokeDasharray={n.kind === "ghost" ? "4 3" : undefined} />
                      {image && (
                        <image
                          href={image}
                          x={-EXPANDED}
                          y={-EXPANDED}
                          width={EXPANDED * 2}
                          height={EXPANDED * 2}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#${prefix}-clip-${i})`}
                          opacity={n.kind === "ghost" ? 0.5 : 1}
                        />
                      )}
                    </g>
                  )}

                  {flag && (
                    <g transform={`translate(${edge * 0.8} ${-edge * 0.9})`} pointerEvents="none">
                      <rect x={-8.5} y={-5.5} width={17} height={11} rx={3} fill="#e11d48" />
                      <text textAnchor="middle" dy="0.35em" fontSize={7} fontWeight={700} fill="#fff">
                        {flag}
                      </text>
                    </g>
                  )}

                  {showLabel && (
                    <text
                      y={labelY}
                      textAnchor="middle"
                      fontSize={n.kind === "center" ? 12.5 : n.kind === "hub" ? 10 : 10.5}
                      fontWeight={n.kind === "card" && !big ? 500 : 650}
                      letterSpacing={n.kind === "hub" ? 0.6 : undefined}
                      fill={n.kind === "hub" || n.kind === "result" ? color : undefined}
                      className={n.kind === "hub" || n.kind === "result" ? undefined : "fill-[#e8eefb]"}
                      paintOrder="stroke"
                      stroke="#04070f"
                      strokeWidth={3}
                    >
                      {shorten(n.kind === "hub" ? n.label.toUpperCase() : n.label, big || n.kind === "center" ? 30 : 20)}
                    </text>
                  )}
                  {n.sublabel && (n.kind === "hub" || n.kind === "result" || big) && (
                    <text y={labelY + 12} textAnchor="middle" fontSize={9.5} className="fill-[#8d9bb8]" paintOrder="stroke" stroke="#04070f" strokeWidth={3}>
                      {n.sublabel}
                    </text>
                  )}
                  {/* The hover preview already names the card; a native tooltip would cover it. */}
                  {!card && <title>{n.sublabel ? `${n.label} (${n.sublabel})` : n.label}</title>}
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      {spinning && spinAt && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: `${((spinAt.x - view.x) / view.w) * 100}%`,
            top: `${((spinAt.y - view.y) / view.h) * 100}%`,
            width: `${(spinWidth / view.w) * 100}%`,
            transform: "translate(-50%, -50%)",
            opacity: isLit(spinning.id) ? 1 : 0.3,
            transition: "opacity 200ms",
          }}
        >
          <SpinningCard imageUrl={spinning.imageUrl!} />
        </div>
      )}
      {cardHover.preview}

      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        <button type="button" className={button} onClick={() => zoomBy(0.7)} aria-label="Zoom in" title="Zoom in (or Ctrl + scroll)">
          +
        </button>
        <button type="button" className={button} onClick={() => zoomBy(1 / 0.7)} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        {(zoomed || Object.keys(moved).length > 0) && (
          <button
            type="button"
            className={button}
            onClick={() => {
              setMoved({});
              animateTo(full);
            }}
            aria-label="Show everything"
            title="Show everything and undo moves"
          >
            ⟲
          </button>
        )}
      </div>
    </div>
  );
}

function shorten(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
