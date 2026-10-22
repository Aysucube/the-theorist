// Deck Synergy's 3D view: the deck as a Dyson sphere around its commander.
// The commander is the star at the center. Each playstyle is a station on the
// sphere's shell, with the cards that feed it clustered around it; cards that
// only work with the commander or in combos sit at the poles. Cards that would
// complete a combo float just outside the shell, and cards that link to
// nothing orbit further out, like planets. Distances are in shell radii.
import type { GraphLink, GraphNode } from "@/components/deck-beta/network-graph";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Orbit {
  radius: number;
  /** How far the orbit tilts from the equator, in radians. */
  tilt: number;
  /** Where it crosses the equator, in radians around the vertical axis. */
  turn: number;
  /** Where on the orbit it starts, in radians. */
  phase: number;
  /** Radians per second; farther planets go slower. */
  speed: number;
}

export interface SphereNode {
  node: GraphNode;
  place: "star" | "hub" | "shell" | "ghost" | "orbit";
  /** Its position (for orbiting cards, at time 0). */
  pos: Vec3;
  orbit?: Orbit;
}

export interface SphereLink {
  link: GraphLink;
  /** Points along it, from source to target. */
  points: Vec3[];
}

export interface SphereScene {
  nodes: SphereNode[];
  links: SphereLink[];
  /** The planets' orbits, to draw as rings. */
  orbits: Orbit[];
}

export const GHOST_RADIUS = 1.22;
const ORBIT_RINGS = [
  { radius: 1.62, tilt: 0.21, turn: 0 },
  { radius: 1.95, tilt: -0.35, turn: 1.3 },
  { radius: 2.28, tilt: 0.5, turn: 2.6 },
];
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const scale = (v: Vec3, k: number) => vec(v.x * k, v.y * k, v.z * k);
const add = (a: Vec3, b: Vec3) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3) => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
function normalize(v: Vec3): Vec3 {
  const l = length(v);
  return l < 1e-9 ? vec(0, 1, 0) : scale(v, 1 / l);
}

/** A direction from latitude and longitude (radians); y is up. */
export function fromLatLon(lat: number, lon: number): Vec3 {
  return vec(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
}

/** Spins a point around the vertical axis. */
export function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

/** Tips a point around the horizontal (left-right) axis. */
export function rotateX(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

/** Where an orbiting card is after `time` seconds. */
export function orbitPosition(orbit: Orbit, time: number): Vec3 {
  const a = orbit.phase + orbit.speed * time;
  const flat = vec(Math.sin(a) * orbit.radius, 0, Math.cos(a) * orbit.radius);
  return rotateY(rotateX(flat, orbit.tilt), orbit.turn);
}

/** Points around an orbit, to draw its ring. */
export function orbitRing(orbit: Orbit, segments = 96): Vec3[] {
  return Array.from({ length: segments + 1 }, (_, i) => orbitPosition({ ...orbit, phase: (i / segments) * Math.PI * 2, speed: 0 }, 0));
}

/**
 * Points from a to b. Between two points off the center it follows the
 * sphere (a great-circle arc, the distance from the center easing from one
 * end to the other), raised by `lift` in the middle; from the center it's a
 * straight beam.
 */
export function arcPoints(a: Vec3, b: Vec3, lift = 0, segments = 16): Vec3[] {
  const ra = length(a);
  const rb = length(b);
  if (ra < 1e-6 || rb < 1e-6) {
    return Array.from({ length: segments + 1 }, (_, i) => add(scale(a, 1 - i / segments), scale(b, i / segments)));
  }
  const ua = normalize(a);
  let ub = normalize(b);
  // Opposite points have no single shortest arc: go round by way of the top.
  if (dot(ua, ub) < -0.999) ub = normalize(add(ub, vec(0, 0.02, 0.02)));
  const omega = Math.acos(Math.min(1, Math.max(-1, dot(ua, ub))));
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const dir =
      omega < 1e-6
        ? ua
        : add(scale(ua, Math.sin((1 - t) * omega) / Math.sin(omega)), scale(ub, Math.sin(t * omega) / Math.sin(omega)));
    const r = ra + (rb - ra) * t + lift * Math.sin(Math.PI * t);
    return scale(normalize(dir), r);
  });
}

/** `count` directions spread around `center` in a sunflower pattern, out to `spread` radians. */
function patch(center: Vec3, count: number, spread: number): Vec3[] {
  const up = Math.abs(center.y) > 0.9 ? vec(1, 0, 0) : vec(0, 1, 0);
  const u = normalize(cross(up, center));
  const v = cross(center, u);
  return Array.from({ length: count }, (_, k) => {
    const theta = spread * Math.sqrt((k + 0.5) / Math.max(1, count));
    const phi = k * GOLDEN_ANGLE;
    const tangent = add(scale(u, Math.cos(phi)), scale(v, Math.sin(phi)));
    return normalize(add(scale(center, Math.cos(theta)), scale(tangent, Math.sin(theta))));
  });
}

/** Directions spread evenly over the whole sphere. */
function fibonacci(count: number): Vec3[] {
  return Array.from({ length: count }, (_, k) => {
    const y = 1 - (2 * (k + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    return vec(Math.cos(k * GOLDEN_ANGLE) * r, y, Math.sin(k * GOLDEN_ANGLE) * r);
  });
}

/**
 * Lays out a deck network (the same nodes and links as the 2D map) as a
 * Dyson sphere. Cards drawn faint in 2D (linked to nothing) become planets.
 */
export function buildSphereScene(nodes: GraphNode[], links: GraphLink[]): SphereScene {
  const placed = new Map<string, SphereNode>();
  const center = nodes.find((n) => n.kind === "center");
  if (center) placed.set(center.id, { node: center, place: "star", pos: vec(0, 0, 0) });

  // Stations: playstyles around the equator, every other one a little north or south.
  const hubs = nodes.filter((n) => n.kind === "hub");
  hubs.forEach((hub, i) => {
    const lat = hubs.length > 3 ? (i % 2 === 0 ? 1 : -1) * 0.3 : 0;
    placed.set(hub.id, { node: hub, place: "hub", pos: fromLatLon(lat, (i / hubs.length) * Math.PI * 2) });
  });

  // Each linked card joins its first playstyle's cluster; the rest go to the poles.
  const cards = nodes.filter((n) => n.kind === "card" && !n.faint);
  const hubOf = new Map<string, string>();
  for (const link of links) {
    if (link.source.startsWith("hub:") && !hubOf.has(link.target)) hubOf.set(link.target, link.source);
  }
  const groups = new Map<string, GraphNode[]>();
  for (const card of cards) {
    const key = hubOf.get(card.id) ?? "pole";
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  const spread = hubs.length > 0 ? Math.min(0.85, (Math.PI / Math.max(1, hubs.length)) * 0.95) : Math.PI;
  for (const [key, members] of groups) {
    let spots: Vec3[];
    if (key === "pole") {
      // No playstyle: split between caps at the north and south poles (or the whole sphere if there are no playstyles).
      if (hubs.length === 0) spots = fibonacci(members.length);
      else {
        const north = patch(vec(0, 1, 0), Math.ceil(members.length / 2), 0.55);
        const south = patch(vec(0, -1, 0), Math.floor(members.length / 2), 0.55);
        spots = members.map((_, k) => (k % 2 === 0 ? north[k / 2] : south[(k - 1) / 2]));
      }
    } else {
      // Around the station, leaving it a little room in the middle.
      spots = patch(placed.get(key)!.pos, members.length + 1, spread).slice(1);
    }
    members.forEach((card, k) => placed.set(card.id, { node: card, place: "shell", pos: spots[k] }));
  }

  // Cards that would complete combos float just outside, above the pieces they join.
  for (const ghost of nodes.filter((n) => n.kind === "ghost")) {
    const partners = links
      .filter((l) => l.target === ghost.id || l.source === ghost.id)
      .map((l) => placed.get(l.target === ghost.id ? l.source : l.target)?.pos)
      .filter((p): p is Vec3 => Boolean(p) && length(p!) > 0.5);
    const direction = partners.length > 0 ? normalize(partners.reduce(add, vec(0, 0, 0))) : fromLatLon(0.6, placed.size);
    placed.set(ghost.id, { node: ghost, place: "ghost", pos: scale(direction, GHOST_RADIUS) });
  }

  // Cards that link to nothing orbit outside, shared out over a few rings.
  const loose = nodes.filter((n) => n.kind === "card" && n.faint);
  const rings = ORBIT_RINGS.slice(0, Math.max(1, Math.min(ORBIT_RINGS.length, Math.ceil(loose.length / 6))));
  const orbits: Orbit[] = [];
  rings.forEach((ring, r) => {
    const members = loose.filter((_, k) => k % rings.length === r);
    if (members.length === 0) return;
    const speed = 0.12 / Math.pow(ring.radius, 1.5);
    orbits.push({ ...ring, phase: 0, speed });
    members.forEach((card, k) => {
      const orbit: Orbit = { ...ring, phase: (k / members.length) * Math.PI * 2 + r * 0.7, speed };
      placed.set(card.id, { node: card, place: "orbit", pos: orbitPosition(orbit, 0), orbit });
    });
  });

  // Links: beams from the star, arcs over the shell; combos ride a little above it.
  const sphereLinks: SphereLink[] = [];
  for (const link of links) {
    const a = placed.get(link.source);
    const b = placed.get(link.target);
    if (!a || !b || a.orbit || b.orbit) continue;
    const combo = link.id.startsWith("combo:") || link.id.startsWith("almost:");
    sphereLinks.push({ link, points: arcPoints(a.pos, b.pos, combo ? 0.08 : 0) });
  }
  return { nodes: [...placed.values()], links: sphereLinks, orbits };
}

export interface Camera {
  /** Turn around the vertical axis, in radians. */
  yaw: number;
  /** Tip toward or away from the viewer, in radians. */
  pitch: number;
}

/** A point as the camera sees it: z grows toward the viewer. */
export function view(v: Vec3, camera: Camera): Vec3 {
  return rotateX(rotateY(v, camera.yaw), camera.pitch);
}

/** The camera angle that brings a direction to the front, facing the viewer. */
export function faceTowards(direction: Vec3): Camera {
  const yaw = Math.atan2(-direction.x, direction.z);
  const flat = Math.hypot(direction.x, direction.z);
  return { yaw, pitch: Math.atan2(direction.y, flat) };
}
