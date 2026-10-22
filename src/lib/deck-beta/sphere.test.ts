import { describe, expect, it } from "vitest";
import type { GraphLink, GraphNode } from "@/components/deck-beta/network-graph";
import { arcPoints, buildSphereScene, faceTowards, GHOST_RADIUS, length, orbitPosition, view } from "./sphere";

const node = (id: string, kind: GraphNode["kind"], extra: Partial<GraphNode> = {}): GraphNode => ({ id, label: id, kind, ring: 0, radius: 10, ...extra });
const link = (source: string, target: string, id = `${source}>${target}`): GraphLink => ({ id, source, target, color: "#fff" });

const nodes: GraphNode[] = [
  node("Lathril", "center"),
  node("hub:Elf", "hub"),
  node("hub:Tokens", "hub"),
  ...["Archdruid", "Priest", "Llanowar", "Visionary"].map((n) => node(n, "card")),
  node("Zulaport", "card"),
  node("ghost:staff", "ghost"),
  ...["Cultivate", "Beast Within", "Swords", "Heroic Intervention", "Sol Ring", "Arcane Signet", "Lightning Greaves"].map((n) => node(n, "card", { faint: true })),
];
const links: GraphLink[] = [
  link("Lathril", "hub:Elf"),
  link("Lathril", "hub:Tokens"),
  ...["Archdruid", "Priest", "Llanowar"].map((n) => link("hub:Elf", n)),
  link("hub:Tokens", "Visionary"),
  link("Lathril", "Zulaport"),
  link("Priest", "ghost:staff", "almost:x:0"),
  link("Archdruid", "Priest", "combo:y:0"),
];
const scene = buildSphereScene(nodes, links);
const at = (id: string) => scene.nodes.find((n) => n.node.id === id)!;

describe("buildSphereScene", () => {
  it("puts the commander at the center and playstyles and linked cards on the shell", () => {
    expect(at("Lathril")).toMatchObject({ place: "star", pos: { x: 0, y: 0, z: 0 } });
    for (const id of ["hub:Elf", "hub:Tokens", "Archdruid", "Priest", "Llanowar", "Visionary", "Zulaport"]) {
      expect(length(at(id).pos)).toBeCloseTo(1, 6);
    }
  });

  it("clusters a playstyle's cards around its station", () => {
    const elf = at("hub:Elf").pos;
    const tokens = at("hub:Tokens").pos;
    const closer = (p: { x: number; y: number; z: number }, to: typeof elf) => p.x * to.x + p.y * to.y + p.z * to.z;
    for (const id of ["Archdruid", "Priest", "Llanowar"]) expect(closer(at(id).pos, elf)).toBeGreaterThan(closer(at(id).pos, tokens));
  });

  it("sends cards with no playstyle to the poles", () => {
    expect(Math.abs(at("Zulaport").pos.y)).toBeGreaterThan(0.8);
  });

  it("floats combo cards just outside the shell and sends unlinked cards into orbit", () => {
    expect(length(at("ghost:staff").pos)).toBeCloseTo(GHOST_RADIUS, 6);
    const planets = scene.nodes.filter((n) => n.place === "orbit");
    expect(planets).toHaveLength(7);
    for (const p of planets) expect(length(p.pos)).toBeGreaterThan(1.5);
    expect(scene.orbits.length).toBeGreaterThanOrEqual(1);
  });

  it("draws every link between placed cards, and none to planets", () => {
    expect(scene.links).toHaveLength(links.length);
    const beam = scene.links.find((l) => l.link.id === "Lathril>hub:Elf")!;
    expect(length(beam.points[0])).toBe(0);
    const arc = scene.links.find((l) => l.link.id === "hub:Elf>Archdruid")!;
    for (const p of arc.points) expect(length(p)).toBeCloseTo(1, 6);
  });
});

describe("arcPoints and orbits", () => {
  it("lifts combo arcs in the middle and keeps their ends", () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 1 };
    const points = arcPoints(a, b, 0.1, 10);
    expect(points[0]).toEqual(a);
    expect(points[10].z).toBeCloseTo(1, 6);
    expect(length(points[5])).toBeCloseTo(1.1, 6);
  });

  it("keeps a planet at its orbit's distance as it moves", () => {
    const orbit = { radius: 2, tilt: 0.4, turn: 1, phase: 0.3, speed: 0.1 };
    for (const t of [0, 5, 50]) expect(length(orbitPosition(orbit, t))).toBeCloseTo(2, 6);
    expect(orbitPosition(orbit, 10)).not.toEqual(orbitPosition(orbit, 0));
  });
});

describe("faceTowards", () => {
  it("turns the camera so a direction faces the viewer", () => {
    for (const d of [{ x: 1, y: 0, z: 0 }, { x: -0.3, y: 0.5, z: -0.8 }, { x: 0, y: -0.9, z: 0.4 }]) {
      const seen = view(d, faceTowards(d));
      expect(seen.x).toBeCloseTo(0, 6);
      expect(seen.y).toBeCloseTo(0, 6);
      expect(seen.z).toBeGreaterThan(0);
    }
  });
});
