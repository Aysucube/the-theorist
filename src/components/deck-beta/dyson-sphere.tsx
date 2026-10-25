"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { manaHexes } from "@/lib/deck-beta/colors";
import { hashString } from "@/lib/deck-beta/land-art";
import { buildSphereScene, faceTowards, fromLatLon, length, orbitPosition, orbitRing, view, type Camera, type SphereNode, type Vec3 } from "@/lib/deck-beta/sphere";
import { scryfallImageAs } from "@/lib/scryfall-images";
import { useCardHover } from "../card-link";
import type { GraphLink, GraphNode } from "./network-graph";
import { SpinningCard } from "./spinning-card";

/** The camera's distance from the star, in shell radii: the perspective's strength. */
const DISTANCE = 4.5;
/** How fast the sphere turns by itself, in radians a second. */
const SPIN = 0.07;
const START: Camera = { yaw: 0.5, pitch: 0.38 };
const LATITUDES = [-60, -30, 0, 30, 60].map((d) => (d * Math.PI) / 180);
const MERIDIANS = Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 6);

const reducedMotion = "(prefers-reduced-motion: reduce)";
function subscribeMotion(notify: () => void) {
  const query = window.matchMedia(reducedMotion);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The shorter way round from one angle to another. */
function turnBetween(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

interface Hit {
  id: string;
  x: number;
  y: number;
  r: number;
}

/**
 * The deck network in 3D, as a Dyson sphere: the commander's card turning at
 * the center like a star, the shell tinted in its colors, playstyles as stations on the shell with
 * their cards clustered round them, combo cards just outside, and cards that
 * link to nothing orbiting further out like planets. Lands that link to
 * nothing make an asteroid belt. Drag to turn it, Ctrl + scroll to zoom, rest
 * on a card for its preview, click to select, double-click to open. It turns
 * to face a combo being walked through.
 */
export function DysonSphere({
  nodes,
  links,
  label,
  centerColors,
  belt,
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
  label: string;
  /** The commander's colors, which tint the shell. */
  centerColors: string[];
  /** How many asteroids (lands that link to nothing) to draw. */
  belt: number;
  highlight?: Set<string>;
  activeLinks?: Set<string>;
  /** Node ids to turn toward. */
  focus?: string[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  previewOf: (node: GraphNode) => string | undefined;
  flagOf?: (node: GraphNode) => string | undefined;
}) {
  const scene = useMemo(() => buildSphereScene(nodes, links), [nodes, links]);
  const wrap = useRef<HTMLDivElement>(null);
  const backCanvas = useRef<HTMLCanvasElement>(null);
  const frontCanvas = useRef<HTMLCanvasElement>(null);
  const cardHover = useCardHover();
  const reduce = useSyncExternalStore(subscribeMotion, () => window.matchMedia(reducedMotion).matches, () => false);
  const [paused, setPaused] = useState<boolean | null>(null);
  const still = paused ?? reduce;
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // The drawing loop runs outside React, so it reads the latest props from here.
  const live = useRef({ highlight, activeLinks, selected, flagOf, zoom, still });
  useEffect(() => {
    live.current = { highlight, activeLinks, selected, flagOf, zoom, still };
  });

  const camera = useRef<Camera>({ ...START });
  const aim = useRef<Camera | null>(null);
  const drag = useRef<{ x: number; y: number; from: Camera; moved: boolean } | null>(null);
  const hovered = useRef<string | null>(null);
  const hits = useRef<Hit[]>([]);
  const images = useRef(new Map<string, HTMLImageElement>());
  const clock = useRef(0);

  const byId = useMemo(() => new Map(scene.nodes.map((n) => [n.node.id, n])), [scene]);

  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Each card's artwork, loaded once.
  useEffect(() => {
    for (const { node } of scene.nodes) {
      if (!node.imageUrl || images.current.has(node.id)) continue;
      const image = new Image();
      image.decoding = "async";
      image.src = scryfallImageAs(node.imageUrl, "art_crop") ?? node.imageUrl;
      images.current.set(node.id, image);
    }
  }, [scene]);

  // Turn to face the cards in focus (a combo being walked through).
  const focusKey = focus?.join("\n") ?? "";
  useEffect(() => {
    const ids = new Set(focusKey ? focusKey.split("\n") : []);
    const points = scene.nodes.filter((n) => ids.has(n.node.id) && length(n.pos) > 0.1).map((n) => n.pos);
    aim.current = points.length > 0 ? faceTowards(points.reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }))) : null;
  }, [focusKey, scene]);

  // Ctrl/⌘ + scroll zooms; plain scrolling still scrolls the page.
  useEffect(() => {
    const element = frontCanvas.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.5, z * Math.exp(-e.deltaY * 0.002))));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const back = backCanvas.current;
    const front = frontCanvas.current;
    if (!back || !front || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of [back, front]) {
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
    }
    const b = back.getContext("2d")!;
    const f = front.getContext("2d")!;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    const font = getComputedStyle(front).fontFamily || "sans-serif";
    const glow = manaHexes(centerColors);

    const neighbors = new Map<string, Set<string>>();
    for (const l of links) {
      neighbors.set(l.source, (neighbors.get(l.source) ?? new Set()).add(l.target));
      neighbors.set(l.target, (neighbors.get(l.target) ?? new Set()).add(l.source));
    }
    // A fixed scatter of background stars, and the asteroid belt.
    const stars = Array.from({ length: 90 }, (_, i) => {
      const h = hashString(`star${i}`);
      return { x: (h % 1000) / 1000, y: ((h >> 10) % 1000) / 1000, size: 0.6 + ((h >> 20) % 3) * 0.4, alpha: 0.15 + ((h >> 4) % 50) / 160 };
    });
    const asteroids = Array.from({ length: belt }, (_, i) => {
      const h = hashString(`rock${i}`);
      return { angle: (i / Math.max(1, belt)) * Math.PI * 2 + ((h % 100) / 100) * 0.3, radius: 1.36 + ((h >> 8) % 100) / 1000, y: (((h >> 16) % 100) - 50) / 1200 };
    });

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const L = live.current;
      const cam = camera.current;
      const resting = L.still || hovered.current !== null || drag.current !== null;
      if (!resting) clock.current += dt;
      if (aim.current) {
        const k = Math.min(1, dt * 3);
        cam.yaw += turnBetween(cam.yaw, aim.current.yaw) * k;
        cam.pitch += (aim.current.pitch - cam.pitch) * k;
      } else if (!resting) {
        cam.yaw += SPIN * dt;
      }
      const time = clock.current;

      const w = size.w;
      const h = size.h;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.3 * L.zoom;
      const project = (p: Vec3) => {
        const v = view(p, cam);
        const s = DISTANCE / (DISTANCE - v.z);
        return { x: cx + v.x * s * R, y: cy - v.y * s * R, z: v.z, s };
      };

      // What stays bright: the hovered card and its neighbours, else the selected one's, else the highlight.
      const focusId = hovered.current ?? L.selected;
      const lit = focusId ? new Set([focusId, ...(neighbors.get(focusId) ?? [])]) : L.highlight;
      const isLit = (id: string) => !lit || lit.has(id);

      b.clearRect(0, 0, w, h);
      f.clearRect(0, 0, w, h);
      for (const star of stars) {
        b.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        b.fillRect(star.x * w, star.y * h, star.size, star.size);
      }

      // A line split in two: the part behind the star on the back canvas, the part in front on the front one.
      const line = (points: Vec3[], color: string, width: number, alpha: [number, number], dash: number[] = []) => {
        const proj = points.map(project);
        for (const [ctx, near] of [[b, false], [f, true]] as const) {
          ctx.beginPath();
          let drawing = false;
          for (let i = 1; i < proj.length; i++) {
            const inFront = (proj[i - 1].z + proj[i].z) / 2 >= 0;
            if (inFront !== near) {
              drawing = false;
              continue;
            }
            if (!drawing) ctx.moveTo(proj[i - 1].x, proj[i - 1].y);
            ctx.lineTo(proj[i].x, proj[i].y);
            drawing = true;
          }
          ctx.globalAlpha = near ? alpha[1] : alpha[0];
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.setLineDash(dash);
          ctx.stroke();
        }
        b.setLineDash([]);
        f.setLineDash([]);
      };

      // The shell: a faint lattice of latitudes and meridians.
      b.globalAlpha = 1;
      const rim = R * (DISTANCE / Math.sqrt(DISTANCE * DISTANCE - 1));
      const shell = b.createRadialGradient(cx, cy, rim * 0.2, cx, cy, rim);
      shell.addColorStop(0, rgba(glow[0], 0.02));
      shell.addColorStop(1, rgba(glow[glow.length - 1], 0.09));
      b.fillStyle = shell;
      b.beginPath();
      b.arc(cx, cy, rim, 0, Math.PI * 2);
      b.fill();
      for (const lat of LATITUDES) line(Array.from({ length: 49 }, (_, i) => fromLatLon(lat, (i / 48) * Math.PI * 2)), "#bcd9ff", 0.8, [0.05, 0.13]);
      for (const lon of MERIDIANS) line(Array.from({ length: 49 }, (_, i) => fromLatLon((i / 48) * Math.PI * 2, lon)), "#bcd9ff", 0.8, [0.05, 0.13]);

      // Orbits and the asteroid belt.
      for (const orbit of scene.orbits) line(orbitRing(orbit), "#c9dcff", 0.8, [0.08, 0.2], [2, 5]);
      for (const rock of asteroids) {
        const a = rock.angle + time * 0.03;
        const p = project({ x: Math.sin(a) * rock.radius, y: rock.y, z: Math.cos(a) * rock.radius });
        const ctx = p.z >= 0 ? f : b;
        ctx.globalAlpha = p.z >= 0 ? 0.55 : 0.3;
        ctx.fillStyle = "#7d8db0";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1 * p.s, 0, Math.PI * 2);
        ctx.fill();
      }

      // Links, with signals running along them.
      for (const { link, points } of scene.links) {
        const active = L.activeLinks?.has(link.id) ?? false;
        const bright = active || (isLit(link.source) && isLit(link.target));
        const width = (link.width ?? 1) * (active ? 2 : 0.9);
        line(points, link.color, width, bright ? [0.3, active ? 0.95 : 0.7] : [0.04, 0.08], link.dashed ? [4, 4] : []);
        if ((link.pulse || active) && bright) {
          const t = (time * 0.3 + (link.delay ?? 0) * 0.37) % 1;
          const at = t * (points.length - 1);
          const i = Math.floor(at);
          const a = points[i];
          const c = points[Math.min(points.length - 1, i + 1)];
          const u = at - i;
          const p = project({ x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u, z: a.z + (c.z - a.z) * u });
          const ctx = p.z >= 0 ? f : b;
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = link.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (width + 1.5) * p.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Cards and stations, back to front.
      const starR = R * 0.3;
      const placed = scene.nodes
        .filter((n) => n.place !== "star")
        .map((n) => ({ n, p: project(n.orbit ? orbitPosition(n.orbit, time) : n.pos) }))
        .sort((a, c) => a.p.z - c.p.z);
      const nextHits: Hit[] = [];
      for (const { n, p } of placed) {
        const ctx = p.z >= 0 ? f : b;
        const r = drawNode(ctx, n, p, R, isLit(n.node.id), focusId === n.node.id || (L.highlight?.has(n.node.id) ?? false), L.flagOf?.(n.node), images.current.get(n.node.id), font);
        // Cards hidden behind the star can't be picked.
        if (!(p.z < 0 && Math.hypot(p.x - cx, p.y - cy) < starR * 0.9)) nextHits.push({ id: n.node.id, x: p.x, y: p.y, r });
      }

      // The commander's card (drawn over the back canvas) sits between the back half of the sphere and the front.
      const commander = scene.nodes.find((n) => n.place === "star");
      if (commander) {
        nextHits.push({ id: commander.node.id, x: cx, y: cy, r: starR * 0.75 });
        f.globalAlpha = 1;
        f.font = `600 ${Math.max(11, R * 0.045)}px ${font}`;
        f.textAlign = "center";
        f.lineWidth = 3;
        f.strokeStyle = "rgba(9, 9, 11, 0.85)";
        f.fillStyle = "#f2f6ff";
        f.strokeText(commander.node.label, cx, cy + starR * 1.05 + 14);
        f.fillText(commander.node.label, cx, cy + starR * 1.05 + 14);
      }
      // Front-most first, so the nearest card wins.
      hits.current = nextHits.reverse();

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, size, belt, centerColors, links]);

  function at(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return hits.current.find((hit) => Math.hypot(hit.x - x, hit.y - y) <= hit.r + 4)?.id ?? null;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      aim.current = null;
      camera.current = { yaw: d.from.yaw + dx * 0.008, pitch: Math.min(1.3, Math.max(-1.3, d.from.pitch + dy * 0.008)) };
      return;
    }
    const id = at(e);
    if (id === hovered.current) return;
    hovered.current = id;
    e.currentTarget.style.cursor = id ? "pointer" : "grab";
    const node = id ? byId.get(id)?.node : undefined;
    const name = node && e.pointerType === "mouse" ? previewOf(node) : undefined;
    if (name) cardHover.show(name, e.currentTarget, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
    else cardHover.hide();
  }

  const button =
    "flex size-8 items-center justify-center rounded-lg border border-line-strong bg-surface/90 text-sm text-foreground backdrop-blur shadow-sm hover:border-accent";
  const starWidth = Math.min(size.w, size.h) * 0.3 * zoom * 0.42;
  const commander = scene.nodes.find((n) => n.place === "star")?.node;

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ aspectRatio: "960 / 660" }}>
      <canvas ref={backCanvas} aria-hidden className="absolute inset-0 h-full w-full" />
      {commander?.imageUrl && starWidth > 0 && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: starWidth }}>
          <SpinningCard imageUrl={commander.imageUrl} />
        </div>
      )}
      <canvas
        ref={frontCanvas}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-grab touch-none"
        onPointerDown={(e) => {
          cardHover.hide();
          drag.current = { x: e.clientX, y: e.clientY, from: { ...camera.current }, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) onSelect(hovered.current === selected ? null : hovered.current);
        }}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => {
          hovered.current = null;
          cardHover.hide();
        }}
        onDoubleClick={() => {
          cardHover.hide();
          if (hovered.current) onOpen(hovered.current);
        }}
      />
      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        <button type="button" className={button} onClick={() => setZoom((z) => Math.min(3, z * 1.3))} aria-label="Zoom in" title="Zoom in (or Ctrl + scroll)">
          +
        </button>
        <button type="button" className={button} onClick={() => setZoom((z) => Math.max(0.5, z / 1.3))} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button
          type="button"
          className={button}
          onClick={() => setPaused(!still)}
          aria-label={still ? "Start turning" : "Stop turning"}
          title={still ? "Start turning" : "Stop turning"}
        >
          {still ? "▶" : "❚❚"}
        </button>
        <button
          type="button"
          className={button}
          onClick={() => {
            camera.current = { ...START };
            aim.current = null;
            setZoom(1);
          }}
          aria-label="Reset the view"
          title="Reset the view"
        >
          ⟲
        </button>
      </div>
      {cardHover.preview}
    </div>
  );
}

/** Draws one card or station; returns its radius on screen, for picking. */
function drawNode(
  ctx: CanvasRenderingContext2D,
  { node, place }: SphereNode,
  p: { x: number; y: number; z: number; s: number },
  R: number,
  lit: boolean,
  big: boolean,
  flag: string | undefined,
  image: HTMLImageElement | undefined,
  font: string,
): number {
  const color = node.color ?? "#8d9bb8";
  const behind = p.z < 0 && place !== "orbit";
  ctx.globalAlpha = (lit ? 1 : 0.18) * (behind ? 0.55 : 1);

  if (place === "hub") {
    const r = R * 0.035 * p.s;
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
    halo.addColorStop(0, rgba(color, 0.7));
    halo.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, node.label.toUpperCase(), p.x, p.y + r + 13, color, font, Math.max(9, R * 0.032 * p.s));
    return r * 1.6;
  }

  const r = R * (place === "orbit" ? 0.052 : place === "ghost" ? 0.047 : 0.045) * p.s * (big ? 1.7 : 1);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#0b1222";
  ctx.fill();
  if (image?.complete && image.naturalWidth > 0) {
    ctx.clip();
    if (place === "ghost") ctx.globalAlpha *= 0.5;
    const ratio = image.naturalWidth / image.naturalHeight;
    const hgt = r * 2;
    const wid = hgt * ratio;
    ctx.drawImage(image, p.x - wid / 2, p.y - r, wid, hgt);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = big ? 2.5 : 1.6;
  if (place === "ghost") ctx.setLineDash([3, 2]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (place === "ghost") label(ctx, "+", p.x, p.y + 4, color, font, r);
  if (flag) {
    ctx.fillStyle = "#e11d48";
    ctx.beginPath();
    ctx.roundRect(p.x + r * 0.45, p.y - r * 1.15, 17, 11, 3);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 7px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(flag, p.x + r * 0.45 + 8.5, p.y - r * 1.15 + 8);
  }
  if (big) label(ctx, node.label, p.x, p.y + r + 13, "#f2f6ff", font, 11);
  return r;
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font: string, size: number) {
  ctx.font = `650 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(9, 9, 11, 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
