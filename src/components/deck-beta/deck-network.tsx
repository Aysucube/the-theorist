"use client";

import { useMemo, useState } from "react";
import { missingPieces } from "@/lib/deck-beta/combos";
import { cardKey } from "@/lib/deck-beta/recommend";
import { deckHubs } from "@/lib/deck-beta/playstyle";
import { interactionsOf, parseTypeLine, tagKind, tagLabel, type DeckAnalysis } from "@/lib/deck-beta/synergy";
import { byImpact } from "@/lib/deck-beta/walkthrough";
import { formatCount } from "@/lib/format";
import type { CardDetails, Combo } from "@/lib/types";
import { useGameChangers } from "@/lib/use-game-changers";
import { HoverName } from "./bits";
import { useWalkthrough, WalkthroughPanel } from "./combo-walkthrough";
import { DysonSphere } from "./dyson-sphere";
import { LandBackdrop } from "./land-backdrop";
import { NetworkGraph, type GraphLink, type GraphNode } from "./network-graph";

/** Playstyle hub colors, then combo colors. */
export const HUB_COLORS = ["#8b5cf6", "#0ea5e9", "#f43f5e", "#14b8a6", "#eab308", "#f97316"];
export const COMBO_COLORS = ["#22c55e", "#ec4899", "#06b6d4", "#facc15", "#a855f7", "#fb7185", "#4ade80", "#38bdf8"];
const COMMANDER_COLOR = "#f59e0b";
/** Combos a card or more away drawn with their missing cards as shaded nodes. */
const MAX_GHOST_COMBOS = 12;

/**
 * The whole deck as a network: the commander in the middle, the deck's
 * playstyles around it, and every card linked to the playstyles it feeds or
 * rewards. Cards that work with the commander link to it; combos run as
 * coloured chains through their pieces, and the cards that would complete
 * one-card-away combos (infinite ones first) sit outside as shaded nodes.
 * Pick a combo to zoom onto it and walk through how it works. Drawn as a flat
 * map over a dimmed land in the commander's colors, or as a 3D Dyson sphere.
 */
export function DeckNetwork({
  commander,
  cards,
  analysis,
  combos,
  almost,
  missing,
  walkId,
  onWalk,
  inDeck,
  onAdd,
  onOpen,
}: {
  commander?: CardDetails;
  cards: CardDetails[];
  analysis: DeckAnalysis;
  /** Combos the deck has. */
  combos: Combo[];
  /** Combos a card away. */
  almost: Combo[];
  /** Details for the cards those combos lack. */
  missing: Record<string, CardDetails>;
  /** The combo being walked through, if any. */
  walkId: string | null;
  onWalk: (comboId: string | null) => void;
  inDeck: (name: string) => boolean;
  onAdd: (card: CardDetails) => void;
  onOpen: (name: string) => void;
}) {
  const [shownCombo, setShownCombo] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"map" | "sphere">("map");
  const hubs = useMemo(() => deckHubs(analysis, 6), [analysis]);
  const colors = commander?.colorIdentity ?? analysis.colors;
  const deckNames = useMemo(() => cards.map((c) => c.name), [cards]);
  const gameChangers = useGameChangers();
  const ghostCombos = useMemo(() => {
    const top = [...almost].sort(byImpact).filter((c) => missingPieces(c, deckNames).length > 0).slice(0, MAX_GHOST_COMBOS);
    const walked = almost.find((c) => c.id === walkId && !top.includes(c));
    return walked ? [...top, walked] : top;
  }, [almost, deckNames, walkId]);

  const { nodes, links, comboPieces, comboLinks, hiddenLands, centerId } = useMemo(() => {
    const centerId = commander?.name ?? "__deck";
    // Hubs sit evenly around the commander, starting at the top.
    const hubAngle = (i: number) => -Math.PI / 2 + (i / Math.max(1, hubs.length)) * Math.PI * 2;
    const nodes: GraphNode[] = [
      commander
        ? { id: centerId, label: commander.name, kind: "center", ring: 0, radius: 38, imageUrl: commander.imageUrl, color: COMMANDER_COLOR }
        : { id: centerId, label: "Your deck", kind: "center", ring: 0, radius: 34, color: COMMANDER_COLOR },
    ];
    const links: GraphLink[] = [];

    hubs.forEach((hub, i) => {
      const id = `hub:${hub.tag}`;
      nodes.push({
        id,
        label: tagLabel(hub.tag),
        sublabel: `${formatCount(hub.cards.length)} cards`,
        kind: "hub",
        ring: 1,
        radius: 24,
        angle: hubAngle(i),
        pinned: true,
        color: HUB_COLORS[i % HUB_COLORS.length],
      });
      links.push({ id: `${id}>center`, source: centerId, target: id, color: HUB_COLORS[i % HUB_COLORS.length], width: 2.2, pulse: true, strength: 1, delay: 0.2 + i * 0.1 });
    });

    const commanderTraits = commander ? analysis.traits.get(commander.name) : undefined;
    const commanderLinks = commanderTraits ? interactionsOf(commanderTraits, analysis.traits, commander!.name) : null;
    const withCommander = new Set(
      commanderLinks ? [...commanderLinks.uses, ...commanderLinks.usedBy].filter((l) => tagKind(l.tag) !== "type").flatMap((l) => l.cards) : [],
    );

    // Each card joins up to two playstyles, rewarding ones first.
    const comboKeys = new Set([...combos, ...ghostCombos].flatMap((c) => c.cards.map(cardKey)));
    let hiddenLands = 0;
    const primary = (card: CardDetails) => {
      const payoff = hubs.findIndex((hub) => hub.payoffs.includes(card.name));
      return payoff >= 0 ? payoff : hubs.findIndex((hub) => hub.cards.includes(card.name));
    };
    // Spread each playstyle's cards across its slice of the circle; the rest share the gaps between slices.
    const groups = new Map<number, string[]>();
    for (const card of cards) {
      if (card.name !== commander?.name) groups.set(primary(card), [...(groups.get(primary(card)) ?? []), card.name]);
    }
    const slice = (Math.PI * 2) / Math.max(1, hubs.length);
    const angleOf = new Map<string, number>();
    // Big groups alternate between two distances, so their cards don't pile up.
    const staggered = new Map<string, number>();
    for (const [hub, names] of groups) {
      names.forEach((name, k) => {
        if (names.length > 8) staggered.set(name, (k % 2) * 0.5);
        angleOf.set(
          name,
          hub >= 0
            ? hubAngle(hub) - slice * 0.42 + ((k + 0.5) / names.length) * slice * 0.84
            : -Math.PI / 2 + ((k + 0.5) / names.length) * Math.PI * 2,
        );
      });
    }
    for (const card of cards) {
      if (card.name === commander?.name) continue;
      const memberOf = hubs
        .map((hub, i) => ({ hub, i, payoff: hub.payoffs.includes(card.name) }))
        .filter(({ hub }) => hub.cards.includes(card.name))
        .sort((a, b) => Number(b.payoff) - Number(a.payoff))
        .slice(0, 2);
      const linked = memberOf.length > 0 || withCommander.has(card.name) || comboKeys.has(cardKey(card.name));
      if (!linked && parseTypeLine(card.typeLine).types.has("Land")) {
        hiddenLands++;
        continue;
      }
      nodes.push({
        id: card.name,
        label: card.name,
        sublabel: memberOf.map(({ hub }) => tagLabel(hub.tag)).join(" · ") || undefined,
        kind: "card",
        ring: linked ? 2 + (staggered.get(card.name) ?? 0) : 3.2,
        radius: linked ? 11 + Math.min(5, memberOf.length * 2 + (withCommander.has(card.name) ? 2 : 0)) : 9,
        angle: linked ? angleOf.get(card.name) : undefined,
        imageUrl: card.imageUrl,
        color: memberOf.length > 0 ? HUB_COLORS[memberOf[0].i % HUB_COLORS.length] : withCommander.has(card.name) ? COMMANDER_COLOR : "#a1a1aa",
        faint: !linked,
      });
      for (const { hub, i } of memberOf) {
        links.push({ id: `${card.name}>hub:${hub.tag}`, source: `hub:${hub.tag}`, target: card.name, color: HUB_COLORS[i % HUB_COLORS.length], width: 1, strength: 0.6, delay: 0.6 });
      }
      if (withCommander.has(card.name)) {
        links.push({ id: `${card.name}>center`, source: centerId, target: card.name, color: COMMANDER_COLOR, width: 1.2, strength: 0.3, delay: 0.8, title: `Works with ${commander!.name}` });
      }
    }

    const present = new Map(nodes.map((n) => [cardKey(n.id), n.id]));
    const idFor = (name: string) => present.get(cardKey(name)) ?? (commander && cardKey(name) === cardKey(commander.name) ? centerId : undefined);
    const comboPieces = new Map<string, string[]>();
    const comboLinks = new Map<string, Set<string>>();

    // Combos the deck has: a coloured chain through their pieces, signals running along it in order.
    combos.forEach((combo, ci) => {
      const color = COMBO_COLORS[ci % COMBO_COLORS.length];
      const pieces = combo.cards.map(idFor).filter((n): n is string => Boolean(n));
      comboPieces.set(combo.id, pieces);
      comboLinks.set(combo.id, new Set());
      pieces.slice(1).forEach((piece, pi) => {
        const id = `combo:${combo.id}:${pi}`;
        comboLinks.get(combo.id)!.add(id);
        links.push({ id, source: pieces[pi], target: piece, color, width: 2.2, pulse: true, strength: 0.9, delay: 1 + pi * 0.35, title: `Combo: ${combo.results.slice(0, 2).join(", ")}` });
      });
    });

    // Combos a card away: the missing card as a shaded node, joined to the pieces the deck has.
    ghostCombos.forEach((combo, gi) => {
      const color = COMBO_COLORS[(combos.length + gi) % COMBO_COLORS.length];
      const lacking = missingPieces(combo, deckNames);
      const ghostIds = lacking.map((name) => `ghost:${cardKey(name)}`);
      const have = combo.cards.map(idFor).filter((n): n is string => Boolean(n));
      // A combo with none of its pieces in the deck (one EDHREC lists for the commander) hangs off the commander.
      const anchors = have.length > 0 ? have : [centerId];
      const angles = have.map((id) => angleOf.get(id)).filter((a): a is number => a !== undefined);
      const angle = angles.length > 0 ? angles.reduce((a, b) => a + b, 0) / angles.length : undefined;
      lacking.forEach((name, li) => {
        if (nodes.some((n) => n.id === ghostIds[li])) return;
        nodes.push({
          id: ghostIds[li],
          label: name,
          sublabel: "Not in your deck",
          kind: "ghost",
          ring: 3 + li * 0.35,
          radius: 12,
          angle: angle === undefined ? undefined : angle + li * 0.1,
          imageUrl: missing[name]?.imageUrl,
          color,
        });
      });
      comboPieces.set(combo.id, [...have, ...ghostIds]);
      comboLinks.set(combo.id, new Set());
      const title = `Add ${lacking.join(" + ")} for: ${combo.results.slice(0, 2).join(", ")}`;
      anchors.forEach((piece, pi) => {
        const id = `almost:${combo.id}:${pi}`;
        comboLinks.get(combo.id)!.add(id);
        links.push({ id, source: piece, target: ghostIds[0], color, width: 1.6, dashed: true, strength: 0.5, title });
      });
      // Missing cards chained to each other, in the combo's order.
      ghostIds.slice(1).forEach((ghost, gi2) => {
        const id = `almost:${combo.id}:g${gi2}`;
        comboLinks.get(combo.id)!.add(id);
        links.push({ id, source: ghostIds[gi2], target: ghost, color, width: 1.6, dashed: true, strength: 0.6, title });
      });
    });
    return { nodes, links, comboPieces, comboLinks, hiddenLands, centerId };
  }, [commander, cards, analysis, hubs, combos, ghostCombos, deckNames, missing]);

  const allCombos = useMemo(() => [...combos, ...ghostCombos], [combos, ghostCombos]);
  const walkCombo = allCombos.find((c) => c.id === walkId);
  const walk = useWalkthrough(walkCombo);
  const colorOf = (comboId: string) => COMBO_COLORS[Math.max(0, allCombos.findIndex((c) => c.id === comboId)) % COMBO_COLORS.length];

  // While walking through a combo: zoom onto its pieces, light up the current step's cards.
  const idForName = (name: string) =>
    nodes.find((n) => cardKey(n.id) === cardKey(name) || n.id === `ghost:${cardKey(name)}`)?.id ??
    (commander && cardKey(name) === cardKey(commander.name) ? centerId : undefined);
  const stepIds = walkCombo ? new Set(walk.steps[walk.step]?.cards.map(idForName).filter((id): id is string => Boolean(id))) : undefined;

  const selectedNode = nodes.find((n) => n.id === selected);
  const selectedCombos = selected ? allCombos.filter((c) => comboPieces.get(c.id)?.includes(selected)) : [];
  const previewOf = (n: GraphNode) => (n.kind === "card" || n.kind === "ghost" || (n.kind === "center" && n.id !== "__deck") ? n.label : undefined);
  const flagOf = (n: GraphNode) => (n.kind !== "hub" && n.kind !== "result" && n.id !== "__deck" && gameChangers.has(n.label) ? "GC" : undefined);
  const open = (id: string) => {
    if (!id.startsWith("hub:") && !id.startsWith("ghost:") && id !== "__deck") onOpen(id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        {mode === "map" && <LandBackdrop colors={colors} seed={commander?.name ?? ""} />}
        {mode === "map" ? (
          <NetworkGraph
            nodes={nodes}
            links={links}
            label="Your deck as a network of playstyles, synergies and combos"
            highlight={walkCombo ? stepIds : shownCombo ? new Set(comboPieces.get(shownCombo)) : undefined}
            activeLinks={walkCombo ? comboLinks.get(walkCombo.id) : undefined}
            focus={walkCombo ? comboPieces.get(walkCombo.id) : undefined}
            selected={selected}
            onSelect={setSelected}
            previewOf={previewOf}
            flagOf={flagOf}
            onOpen={open}
          />
        ) : (
          <DysonSphere
            nodes={nodes}
            links={links}
            label="Your deck as a Dyson sphere: the commander a star at the center, playstyles and the cards that feed them on the shell, unlinked cards orbiting outside"
            centerColors={colors}
            belt={hiddenLands}
            highlight={walkCombo ? stepIds : shownCombo ? new Set(comboPieces.get(shownCombo)) : undefined}
            activeLinks={walkCombo ? comboLinks.get(walkCombo.id) : undefined}
            focus={walkCombo ? comboPieces.get(walkCombo.id) : undefined}
            selected={selected}
            onSelect={setSelected}
            previewOf={(n) => previewOf(n)}
            flagOf={flagOf}
            onOpen={open}
          />
        )}
        <div role="radiogroup" aria-label="Network view" className="absolute top-2 left-2 flex gap-1 rounded-lg border border-zinc-700 bg-zinc-900/90 p-0.5 text-xs">
          {(["map", "sphere"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 font-medium ${mode === m ? "bg-amber-500 text-zinc-950" : "text-zinc-300 hover:text-white"}`}
            >
              {m === "map" ? "2D map" : "3D sphere"}
            </button>
          ))}
        </div>
        {walkCombo && (
          <WalkthroughPanel
            combo={walkCombo}
            color={colorOf(walkCombo.id)}
            steps={walk.steps}
            step={walk.step}
            setStep={walk.setStep}
            playing={walk.playing}
            setPlaying={walk.setPlaying}
            onClose={() => onWalk(null)}
          />
        )}
      </div>

      {selectedNode && (
        <SelectionBar
          node={selectedNode}
          combos={selectedCombos}
          colorOf={colorOf}
          missingCard={selectedNode.kind === "ghost" ? missing[selectedNode.label] : undefined}
          inDeck={inDeck}
          onAdd={onAdd}
          onOpen={onOpen}
          onWalk={onWalk}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Playstyles</span>
          {hubs.length === 0 && <span className="text-zinc-500">None stand out yet.</span>}
          {hubs.map((hub, i) => (
            <span key={hub.tag} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-0.5 dark:border-zinc-800">
              <span aria-hidden className="size-2 rounded-full" style={{ background: HUB_COLORS[i % HUB_COLORS.length] }} />
              {tagLabel(hub.tag)}
              <span className="text-xs text-zinc-500 tabular-nums">
                {formatCount(hub.payoffs.length)} payoffs · {formatCount(hub.enablers.length)} enablers
              </span>
            </span>
          ))}
        </div>
        {allCombos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Combos</span>
            {allCombos.map((combo) => {
              const ghost = ghostCombos.includes(combo);
              return (
                <button
                  key={combo.id}
                  type="button"
                  onMouseEnter={() => setShownCombo(combo.id)}
                  onMouseLeave={() => setShownCombo(null)}
                  onFocus={() => setShownCombo(combo.id)}
                  onBlur={() => setShownCombo(null)}
                  onClick={() => onWalk(walkId === combo.id ? null : combo.id)}
                  aria-pressed={walkId === combo.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 hover:border-amber-500 ${
                    walkId === combo.id ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40" : "border-zinc-200 dark:border-zinc-800"
                  } ${ghost ? "border-dashed" : ""}`}
                  title={`${combo.cards.join(" + ")}: click to walk through it`}
                >
                  <span aria-hidden className="size-2 rounded-full" style={{ background: colorOf(combo.id) }} />
                  {combo.results[0] ?? "Combo"}
                  {ghost && (
                    <span className="text-xs text-zinc-500">
                      +{missingPieces(combo, deckNames).length} {missingPieces(combo, deckNames).length === 1 ? "card" : "cards"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {mode === "map" ? (
          <p className="text-xs text-zinc-500">
            Click a combo to zoom in and walk through it step by step. Click a card to select it, double-click to open its
            own network; drag cards or the background to move them, and zoom with the buttons or Ctrl + scroll. Shaded dashed
            cards aren’t in your deck: each completes a combo.
            {hiddenLands > 0 && ` ${formatCount(hiddenLands)} lands that don’t link to anything aren’t shown.`}
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Your commander is the star at the center. Each playstyle is a station on the sphere’s shell, with the
            cards that feed it gathered round it; cards that only work with your commander sit at the poles, and cards that
            would complete a combo float just outside. Cards that link to nothing orbit further out like planets
            {hiddenLands > 0 ? `, and ${formatCount(hiddenLands)} unlinked lands make up the asteroid belt` : ""}. Drag to
            turn it, zoom with the buttons or Ctrl + scroll, click a card to select it and double-click to open its network.
          </p>
        )}
      </div>
    </div>
  );
}

function SelectionBar({
  node,
  combos,
  colorOf,
  missingCard,
  inDeck,
  onAdd,
  onOpen,
  onWalk,
  onClose,
}: {
  node: GraphNode;
  combos: Combo[];
  colorOf: (comboId: string) => string;
  missingCard?: CardDetails;
  inDeck: (name: string) => boolean;
  onAdd: (card: CardDetails) => void;
  onOpen: (name: string) => void;
  onWalk: (comboId: string) => void;
  onClose: () => void;
}) {
  const small = "h-8 rounded-lg border border-zinc-300 px-3 text-xs font-medium hover:border-amber-500 dark:border-zinc-700";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
      <span aria-hidden className={`size-2.5 rounded-full ${node.kind === "ghost" ? "border border-dashed" : ""}`} style={{ background: node.color }} />
      {node.kind === "hub" || node.id === "__deck" ? (
        <span className="font-medium">{node.label}</span>
      ) : (
        <HoverName name={node.label} className="font-medium" />
      )}
      {node.sublabel && <span className="text-xs text-zinc-500">{node.sublabel}</span>}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        {combos.map((combo) => (
          <button key={combo.id} type="button" className={small} onClick={() => onWalk(combo.id)}>
            <span aria-hidden className="mr-1 inline-block size-2 rounded-full" style={{ background: colorOf(combo.id) }} />
            Walk through {combo.results[0] ?? "combo"}
          </button>
        ))}
        {node.kind === "ghost" && missingCard && (
          <button
            type="button"
            disabled={inDeck(missingCard.name)}
            onClick={() => onAdd(missingCard)}
            className="h-8 rounded-lg bg-amber-500 px-3 text-xs font-medium text-zinc-950 hover:bg-amber-400 disabled:bg-transparent disabled:text-emerald-600"
          >
            {inDeck(missingCard.name) ? "In deck ✓" : `+ Add ${missingCard.name}`}
          </button>
        )}
        {(node.kind === "card" || node.kind === "center") && node.id !== "__deck" && (
          <button type="button" className={small} onClick={() => onOpen(node.id)}>
            Open its network
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Clear selection" className="rounded px-1.5 text-lg leading-none text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ×
        </button>
      </span>
    </div>
  );
}
