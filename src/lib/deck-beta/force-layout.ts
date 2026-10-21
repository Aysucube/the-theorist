// Places the nodes of a synergy network on rings around the centre: rings
// are ellipses that fill the picture, nodes can be given an angle (and
// pinned there), and a small force simulation (nodes push apart, links pull
// together) tidies the rest. Deterministic, so the same deck always draws the
// same way.

export interface LayoutNode {
  id: string;
  /** 0 = the centre; 1, 2, 3... rings further out. */
  ring: number;
  radius: number;
  /** Where on its ring it belongs, in radians (0 = right, clockwise). */
  angle?: number;
  /** Stay exactly at `angle` on its ring. */
  pinned?: boolean;
}

export interface LayoutLink {
  source: string;
  target: string;
  /** 0–1: how hard the link pulls. */
  strength?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Space kept clear around the edge (for labels). */
  margin?: number;
  iterations?: number;
}

/** A small stable hash, for repeatable jitter. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function layoutNetwork(nodes: LayoutNode[], links: LayoutLink[], options: LayoutOptions): Map<string, Point> {
  const { width, height, margin = 36, iterations = 240 } = options;
  const cx = width / 2;
  const cy = height / 2;
  const maxRing = Math.max(1, ...nodes.map((n) => n.ring));
  // Rings are ellipses, so wide pictures use their width; inner rings sit a bit further out than evenly spaced.
  const scale = (ring: number) => (ring <= 0 ? 0 : Math.pow(ring / maxRing, 0.75));
  const rx = width / 2 - margin;
  const ry = height / 2 - margin;
  const onRing = (ring: number, angle: number) => ({ x: cx + Math.cos(angle) * rx * scale(ring), y: cy + Math.sin(angle) * ry * scale(ring) });

  // Start every node on its ring: at its angle, or spread evenly with a little jitter.
  const byRing = new Map<number, LayoutNode[]>();
  for (const n of nodes) byRing.set(n.ring, [...(byRing.get(n.ring) ?? []), n]);
  const pos = new Map<string, Point & { vx: number; vy: number }>();
  for (const [ring, members] of byRing) {
    members.forEach((n, i) => {
      const angle = n.angle ?? (i / members.length) * Math.PI * 2 + hash(n.id) * 0.4;
      const p = onRing(ring, angle);
      pos.set(n.id, { ...p, vx: 0, vy: 0 });
    });
  }

  const index = new Map(nodes.map((n) => [n.id, n]));
  const valid = links.filter((l) => index.has(l.source) && index.has(l.target));

  for (let step = 0; step < iterations; step++) {
    const heat = 1 - step / iterations;
    // Push apart: every pair, much harder when they overlap.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const pa = pos.get(a.id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const pb = pos.get(b.id)!;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = hash(a.id + b.id) - 0.5;
          dy = hash(b.id + a.id) - 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const gap = a.radius + b.radius + 8;
        const push = (300 / d2) * heat + (d < gap ? (gap - d) * 0.4 : 0);
        const fx = (dx / d) * push;
        const fy = (dy / d) * push;
        pa.vx -= fx;
        pa.vy -= fy;
        pb.vx += fx;
        pb.vy += fy;
      }
    }
    // Pull linked nodes together, gently: the rings and angles carry the structure.
    for (const link of valid) {
      const pa = pos.get(link.source)!;
      const pb = pos.get(link.target)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const pull = 0.003 * (link.strength ?? 0.5) * heat;
      pa.vx += dx * pull;
      pa.vy += dy * pull;
      pb.vx -= dx * pull;
      pb.vy -= dy * pull;
    }
    // Keep each node on its ring (and near its angle), then move.
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      if (n.ring === 0 || n.pinned) {
        const fixed = n.ring === 0 ? { x: cx, y: cy } : onRing(n.ring, n.angle ?? 0);
        p.x = fixed.x;
        p.y = fixed.y;
        p.vx = p.vy = 0;
        continue;
      }
      if (n.angle !== undefined) {
        const target = onRing(n.ring, n.angle);
        p.vx += (target.x - p.x) * 0.05;
        p.vy += (target.y - p.y) * 0.05;
      }
      // Back onto the ring along the line from the centre (measured in ellipse units).
      const ex = (p.x - cx) / rx;
      const ey = (p.y - cy) / ry;
      const e = Math.sqrt(ex * ex + ey * ey) || 0.001;
      const want = scale(n.ring) / e;
      p.vx += (cx + (p.x - cx) * want - p.x) * 0.12;
      p.vy += (cy + (p.y - cy) * want - p.y) * 0.12;
      p.vx *= 0.55;
      p.vy *= 0.55;
      p.x = Math.min(width - n.radius - 4, Math.max(n.radius + 4, p.x + p.vx));
      p.y = Math.min(height - n.radius - 4, Math.max(n.radius + 4, p.y + p.vy));
    }
  }
  return new Map([...pos].map(([id, p]) => [id, { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }]));
}
