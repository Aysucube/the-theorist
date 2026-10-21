import { describe, expect, it } from "vitest";
import { layoutNetwork, type LayoutNode } from "./force-layout";

const nodes: LayoutNode[] = [
  { id: "commander", ring: 0, radius: 30 },
  ...["Elves", "Tokens", "Sacrifice"].map((id) => ({ id, ring: 1, radius: 20 })),
  ...Array.from({ length: 40 }, (_, i) => ({ id: `card ${i}`, ring: 2, radius: 12 })),
];
const links = nodes.slice(4).map((n, i) => ({ source: n.id, target: ["Elves", "Tokens", "Sacrifice"][i % 3], strength: 0.8 }));

describe("layoutNetwork", () => {
  const layout = layoutNetwork(nodes, links, { width: 800, height: 600 });

  it("pins the centre and keeps every node inside the picture", () => {
    expect(layout.get("commander")).toEqual({ x: 400, y: 300 });
    for (const n of nodes) {
      const p = layout.get(n.id)!;
      expect(p.x).toBeGreaterThanOrEqual(n.radius);
      expect(p.x).toBeLessThanOrEqual(800 - n.radius);
      expect(p.y).toBeGreaterThanOrEqual(n.radius);
      expect(p.y).toBeLessThanOrEqual(600 - n.radius);
    }
  });

  it("keeps outer rings further from the centre than inner ones", () => {
    const distance = (id: string) => Math.hypot(layout.get(id)!.x - 400, layout.get(id)!.y - 300);
    const hubs = ["Elves", "Tokens", "Sacrifice"].map(distance);
    const cards = nodes.slice(4).map((n) => distance(n.id));
    const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(average(cards)).toBeGreaterThan(average(hubs));
  });

  it("mostly keeps nodes from overlapping", () => {
    let overlaps = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = layout.get(nodes[i].id)!;
        const b = layout.get(nodes[j].id)!;
        if (Math.hypot(a.x - b.x, a.y - b.y) < (nodes[i].radius + nodes[j].radius) * 0.7) overlaps++;
      }
    }
    expect(overlaps).toBeLessThan(5);
  });

  it("draws the same deck the same way every time", () => {
    expect(layoutNetwork(nodes, links, { width: 800, height: 600 })).toEqual(layout);
  });
});
