"use client";

import { useMemo, useState } from "react";
import { combosWith, piecesInDeck } from "@/lib/deck-beta/combos";
import { cardKey, pairingsInDeck } from "@/lib/deck-beta/recommend";
import { interactionsOf, tagKind, tagLabel, type DeckAnalysis, type Tag } from "@/lib/deck-beta/synergy";
import { byImpact } from "@/lib/deck-beta/walkthrough";
import type { CardDetails, Combo, DeckCombos, EdhrecPairing } from "@/lib/types";
import { useGameChangers } from "@/lib/use-game-changers";
import { HoverName } from "./bits";
import { useWalkthrough, WalkthroughPanel } from "./combo-walkthrough";
import { LandBackdrop } from "./land-backdrop";
import { COMBO_COLORS } from "./deck-network";
import { NetworkGraph, type GraphLink, type GraphNode } from "./network-graph";

/** Synergy partners drawn around the card. */
const MAX_PARTNERS = 14;
const MAX_COMBOS = 5;
const MAX_ALMOST = 5;
const COMMANDER_COLOR = "#f59e0b";
const KIND_COLOR = { type: "#a1a1aa", subtype: "#38bdf8", theme: "#a78bfa" } as const;

/** The combos drawn in a card's network, in the order (and colours) they're drawn. */
export function cardCombos(focus: CardDetails, deckNames: string[], combos?: DeckCombos | null, walkId?: string | null) {
  const included = combos ? combosWith(combos.included, focus.name).sort(byImpact).slice(0, MAX_COMBOS) : [];
  // A card or more away (missing a card other than this one), EDHREC's combos for the commander first.
  const near = combos ? [...combos.almostIncluded, ...(combos.wider ?? [])] : [];
  const almost = combos
    ? combosWith(near, focus.name)
        .filter((c) => !piecesInDeck(c, deckNames).every(Boolean))
        .sort(byImpact)
        .slice(0, MAX_ALMOST)
    : [];
  // A combo being walked through is drawn even if it isn't among the first few.
  const walked = combos?.included.find((c) => c.id === walkId && !included.includes(c));
  if (walked) included.push(walked);
  const walkedAlmost = near.find((c) => c.id === walkId && !almost.includes(c));
  if (walkedAlmost) almost.push(walkedAlmost);
  return { included, almost, all: [...included, ...almost] };
}

/**
 * A card's own network: the card in the middle, its strongest synergies in
 * the deck around it, the commander, and each combo it's part of drawn as a
 * line of combination from the card through the other pieces to what the
 * combo does (a diamond). Cards the deck lacks are shaded. Click a combo's
 * diamond to zoom onto it and walk through it step by step.
 */
export function CardNetwork({
  focus,
  commander,
  analysis,
  deckNames,
  details,
  combos,
  pairings,
  missing,
  walkId,
  onWalk,
  inDeck,
  onAdd,
  onOpen,
}: {
  focus: CardDetails;
  commander?: CardDetails;
  analysis: DeckAnalysis;
  /** Every deck card by Scryfall name, commander included. */
  deckNames: string[];
  details: Map<string, CardDetails>;
  combos?: DeckCombos | null;
  pairings?: EdhrecPairing[];
  missing: Record<string, CardDetails>;
  walkId: string | null;
  onWalk: (comboId: string | null) => void;
  inDeck: (name: string) => boolean;
  onAdd: (card: CardDetails) => void;
  onOpen: (name: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const gameChangers = useGameChangers();
  const drawn = useMemo(() => cardCombos(focus, deckNames, combos, walkId), [focus, deckNames, combos, walkId]);

  const { nodes, links, comboNodes, comboLinks } = useMemo(() => {
    const nodes: GraphNode[] = [{ id: focus.name, label: focus.name, kind: "center", ring: 0, radius: 40, imageUrl: focus.imageUrl, color: COMMANDER_COLOR }];
    const links: GraphLink[] = [];
    const ids = new Set([focus.name]);
    const comboNodes = new Map<string, string[]>();
    const comboLinks = new Map<string, Set<string>>();

    // Strongest synergy partners: shared tags (specific ones count double) plus EDHREC's pairing data.
    const traits = analysis.traits.get(focus.name);
    const tagsWith = new Map<string, Tag[]>();
    if (traits) {
      const found = interactionsOf(traits, analysis.traits, focus.name);
      for (const link of [...found.uses, ...found.usedBy]) {
        for (const name of link.cards) tagsWith.set(name, [...(tagsWith.get(name) ?? []), link.tag]);
      }
    }
    const edhrec = new Map((pairings ? pairingsInDeck(pairings, deckNames) : []).map((p) => [p.name, p.lift]));
    const score = (name: string) =>
      (tagsWith.get(name) ?? []).reduce((s, t) => s + (tagKind(t) === "type" ? 1 : 2), 0) + Math.log(Math.max(1, edhrec.get(name) ?? 1)) * 2;
    const partners = [...new Set([...tagsWith.keys(), ...edhrec.keys()])]
      .filter((n) => n !== focus.name && n !== commander?.name)
      .sort((a, b) => score(b) - score(a) || a.localeCompare(b))
      .slice(0, MAX_PARTNERS);

    const comboAngle = (c: number) => -Math.PI / 2 + ((c + 0.5) / Math.max(1, drawn.all.length)) * Math.PI * 2;

    if (commander && commander.name !== focus.name) {
      const shared = tagsWith.get(commander.name) ?? [];
      nodes.push({ id: commander.name, label: commander.name, sublabel: "Commander", kind: "card", ring: 1, radius: 20, imageUrl: commander.imageUrl, color: COMMANDER_COLOR });
      ids.add(commander.name);
      links.push({
        id: "commander",
        source: commander.name,
        target: focus.name,
        color: COMMANDER_COLOR,
        width: shared.length > 0 ? 2 : 1,
        dashed: shared.length === 0,
        pulse: shared.length > 0,
        strength: 0.9,
        title: shared.length > 0 ? `Works with your commander: ${shared.map(tagLabel).join(", ")}` : "No direct link to your commander",
      });
    }

    partners.forEach((name, i) => {
      const tags = tagsWith.get(name) ?? [];
      const best = tags.find((t) => tagKind(t) !== "type") ?? tags[0];
      const color = best ? KIND_COLOR[tagKind(best)] : COMMANDER_COLOR;
      nodes.push({
        id: name,
        label: name,
        sublabel: tags.slice(0, 2).map(tagLabel).join(" · ") || undefined,
        kind: "card",
        ring: 1,
        radius: 13 + Math.min(6, score(name)),
        angle: -Math.PI / 2 + ((i + 0.5) / partners.length) * Math.PI * 2 + Math.PI / Math.max(2, drawn.all.length * 2),
        imageUrl: details.get(name)?.imageUrl,
        color,
      });
      ids.add(name);
      const lift = edhrec.get(name);
      links.push({
        id: `partner:${name}`,
        source: focus.name,
        target: name,
        color,
        width: 1 + Math.min(2, score(name) / 3),
        pulse: true,
        strength: 0.7,
        delay: 0.3 + i * 0.06,
        title: [tags.map(tagLabel).join(", "), lift ? `EDHREC: played together ×${lift.toFixed(1)}` : ""].filter(Boolean).join(" · "),
      });
    });

    // Lines of combination: card → other pieces → what the combo does.
    drawn.all.forEach((combo, ci) => {
      const almost = ci >= drawn.included.length;
      const color = COMBO_COLORS[ci % COMBO_COLORS.length];
      const angle = comboAngle(ci);
      const id = `${almost ? "almost" : "combo"}:${combo.id}`;
      const pieces = [focus.name, ...combo.cards.filter((n) => cardKey(n) !== cardKey(focus.name))];
      const chain: string[] = [focus.name];
      const chainLinks = new Set<string>();
      let previous = focus.name;
      pieces.slice(1).forEach((name, pi) => {
        const inDeck = deckNames.find((n) => cardKey(n) === cardKey(name));
        const nodeId = inDeck ?? `missing:${name}`;
        if (!ids.has(nodeId)) {
          nodes.push({
            id: nodeId,
            label: name,
            sublabel: inDeck ? undefined : "Not in your deck",
            kind: inDeck ? "card" : "ghost",
            ring: 2,
            radius: 15,
            angle: angle + (pi - (pieces.length - 2) / 2) * 0.22,
            imageUrl: details.get(inDeck ?? name)?.imageUrl ?? missing[name]?.imageUrl,
            color,
          });
          ids.add(nodeId);
        }
        const linkId = `${id}:${pi}`;
        chainLinks.add(linkId);
        links.push({ id: linkId, source: previous, target: nodeId, color, width: 2.2, pulse: true, dashed: almost, strength: 1, delay: 0.8 + ci * 0.3 + pi * 0.45 });
        chain.push(nodeId);
        previous = nodeId;
      });
      const resultId = `${id}:result`;
      nodes.push({
        id: resultId,
        label: combo.results[0] ?? "Combo",
        sublabel: combo.results.length > 1 ? `+${combo.results.length - 1} more · click to walk through` : "Click to walk through",
        kind: "result",
        ring: 3,
        radius: 24,
        angle,
        color,
      });
      chainLinks.add(`${id}:end`);
      links.push({ id: `${id}:end`, source: previous, target: resultId, color, width: 2.2, pulse: true, dashed: almost, strength: 1, delay: 0.8 + ci * 0.3 + (pieces.length - 1) * 0.45 });
      comboNodes.set(combo.id, [...chain, resultId]);
      comboLinks.set(combo.id, chainLinks);
    });

    return { nodes, links, comboNodes, comboLinks };
  }, [focus, commander, analysis, deckNames, details, drawn, pairings, missing]);

  const walkCombo = drawn.all.find((c) => c.id === walkId);
  const walk = useWalkthrough(walkCombo);
  const comboFor = (nodeId: string): Combo | undefined => drawn.all.find((c) => nodeId === `combo:${c.id}:result` || nodeId === `almost:${c.id}:result`);
  const colorOf = (combo: Combo) => COMBO_COLORS[Math.max(0, drawn.all.indexOf(combo)) % COMBO_COLORS.length];
  const idForName = (name: string) =>
    cardKey(name) === cardKey(focus.name) ? focus.name : (deckNames.find((n) => cardKey(n) === cardKey(name)) ?? `missing:${name}`);
  const stepIds = walkCombo ? new Set(walk.steps[walk.step]?.cards.map(idForName)) : undefined;
  // The last step (the result) also lights up the diamond.
  if (walkCombo && stepIds && walk.step === walk.steps.length - 1) stepIds.add(`${drawn.included.includes(walkCombo) ? "combo" : "almost"}:${walkCombo.id}:result`);

  const selectedNode = nodes.find((n) => n.id === selected);
  const ghostCard = selectedNode?.kind === "ghost" ? missing[selectedNode.label] : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <LandBackdrop colors={commander?.colorIdentity ?? focus.colorIdentity} seed={commander?.name ?? focus.name} />
        <NetworkGraph
          nodes={nodes}
          links={links}
          width={900}
          height={600}
          label={`${focus.name}'s synergies and combos`}
          highlight={stepIds}
          activeLinks={walkCombo ? comboLinks.get(walkCombo.id) : undefined}
          focus={walkCombo ? comboNodes.get(walkCombo.id) : undefined}
          selected={selected}
          onSelect={(id) => {
            const combo = id ? comboFor(id) : undefined;
            if (combo) {
              onWalk(combo.id);
              setSelected(null);
            } else setSelected(id);
          }}
          previewOf={(n) => (n.kind === "result" ? undefined : n.label)}
          flagOf={(n) => (n.kind !== "result" && gameChangers.has(n.label) ? "GC" : undefined)}
          onOpen={(id) => {
            const combo = comboFor(id);
            if (combo) onWalk(combo.id);
            else if (!id.startsWith("missing:") && id !== focus.name) onOpen(id);
          }}
        />
      </div>
      {walkCombo && (
        <WalkthroughPanel
          floating={false}
          combo={walkCombo}
          color={colorOf(walkCombo)}
          steps={walk.steps}
          step={walk.step}
          setStep={walk.setStep}
          playing={walk.playing}
          setPlaying={walk.setPlaying}
          onClose={() => onWalk(null)}
        />
      )}
      {selectedNode && selectedNode.kind !== "result" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
          <HoverName name={selectedNode.label} className="font-medium" />
          {selectedNode.sublabel && <span className="text-xs text-zinc-500">{selectedNode.sublabel}</span>}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {drawn.all
              .filter((c) => comboNodes.get(c.id)?.includes(selectedNode.id))
              .map((c) => (
                <button key={c.id} type="button" onClick={() => onWalk(c.id)} className="h-8 rounded-lg border border-zinc-300 px-3 text-xs font-medium hover:border-amber-500 dark:border-zinc-700">
                  Walk through {c.results[0] ?? "combo"}
                </button>
              ))}
            {ghostCard && (
              <button
                type="button"
                disabled={inDeck(ghostCard.name)}
                onClick={() => onAdd(ghostCard)}
                className="h-8 rounded-lg bg-amber-500 px-3 text-xs font-medium text-zinc-950 hover:bg-amber-400 disabled:bg-transparent disabled:text-emerald-600"
              >
                {inDeck(ghostCard.name) ? "In deck ✓" : `+ Add ${ghostCard.name}`}
              </button>
            )}
            {selectedNode.kind === "card" && (
              <button type="button" onClick={() => onOpen(selectedNode.id)} className="h-8 rounded-lg border border-zinc-300 px-3 text-xs font-medium hover:border-amber-500 dark:border-zinc-700">
                Open its network
              </button>
            )}
            <button type="button" onClick={() => setSelected(null)} aria-label="Clear selection" className="rounded px-1.5 text-lg leading-none text-zinc-500">
              ×
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
