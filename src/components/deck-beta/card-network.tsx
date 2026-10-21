"use client";

import { useMemo } from "react";
import { combosWith, piecesInDeck } from "@/lib/deck-beta/combos";
import { cardKey, pairingsInDeck } from "@/lib/deck-beta/recommend";
import { interactionsOf, tagKind, tagLabel, type DeckAnalysis, type Tag } from "@/lib/deck-beta/synergy";
import type { CardDetails, DeckCombos, EdhrecPairing } from "@/lib/types";
import { COMBO_COLORS } from "./deck-network";
import { NetworkGraph, type GraphLink, type GraphNode } from "./network-graph";

/** Synergy partners drawn around the card. */
const MAX_PARTNERS = 14;
const MAX_COMBOS = 5;
const MAX_ALMOST = 3;
const COMMANDER_COLOR = "#f59e0b";
const KIND_COLOR = { type: "#a1a1aa", subtype: "#38bdf8", theme: "#a78bfa" } as const;

/**
 * A card's own network: the card in the middle, its strongest synergies in
 * the deck around it, the commander, and each combo it's part of drawn as a
 * line of combination from the card through the other pieces to what the
 * combo does. Combos one card away show the missing card as a ghost.
 */
export function CardNetwork({
  focus,
  commander,
  analysis,
  deckNames,
  details,
  combos,
  pairings,
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
  onOpen: (name: string) => void;
}) {
  const { nodes, links } = useMemo(() => {
    const nodes: GraphNode[] = [{ id: focus.name, label: focus.name, kind: "center", ring: 0, radius: 40, imageUrl: focus.imageUrl, color: COMMANDER_COLOR }];
    const links: GraphLink[] = [];
    const ids = new Set([focus.name]);

    // Strongest synergy partners: shared tags (specific ones count double) plus EDHREC's pairing data.
    const traits = analysis.traits.get(focus.name);
    const tagsWith = new Map<string, Tag[]>();
    if (traits) {
      const links2 = interactionsOf(traits, analysis.traits, focus.name);
      for (const link of [...links2.uses, ...links2.usedBy]) {
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

    if (commander && commander.name !== focus.name) {
      const shared = tagsWith.get(commander.name) ?? [];
      nodes.push({ id: commander.name, label: commander.name, kind: "card", ring: 1, radius: 24, imageUrl: commander.imageUrl, color: COMMANDER_COLOR, sublabel: "Commander" });
      ids.add(commander.name);
      links.push({
        id: "commander",
        source: commander.name,
        target: focus.name,
        color: COMMANDER_COLOR,
        width: shared.length > 0 ? 2.5 : 1,
        dashed: shared.length === 0,
        pulse: shared.length > 0,
        strength: 0.9,
        title: shared.length > 0 ? `Works with your commander: ${shared.map(tagLabel).join(", ")}` : "No direct link to your commander",
      });
    }

    // Combos fan out in their own directions; synergy partners fill the ring in between.
    const comboCount = (combos ? Math.min(MAX_COMBOS, combosWith(combos.included, focus.name).length) : 0) +
      (combos ? Math.min(MAX_ALMOST, combosWith(combos.almostIncluded, focus.name).length) : 0);
    const comboAngle = (c: number) => -Math.PI / 2 + ((c + 0.5) / Math.max(1, comboCount)) * Math.PI * 2;
    partners.forEach((name, i) => {
      const tags = tagsWith.get(name) ?? [];
      const best = tags.find((t) => tagKind(t) !== "type") ?? tags[0];
      const color = best ? KIND_COLOR[tagKind(best)] : "#f59e0b";
      nodes.push({
        id: name,
        label: name,
        kind: "card",
        ring: 1,
        radius: 13 + Math.min(6, score(name)),
        angle: -Math.PI / 2 + ((i + 0.5) / partners.length) * Math.PI * 2 + Math.PI / Math.max(2, comboCount * 2),
        imageUrl: details.get(name)?.imageUrl,
      });
      ids.add(name);
      const lift = edhrec.get(name);
      links.push({
        id: `partner:${name}`,
        source: focus.name,
        target: name,
        color,
        width: 1 + Math.min(2.5, score(name) / 3),
        pulse: true,
        strength: 0.7,
        delay: 0.3 + i * 0.06,
        title: [tags.map(tagLabel).join(", "), lift ? `EDHREC: played together ×${lift.toFixed(1)}` : ""].filter(Boolean).join(" · "),
      });
    });

    // Lines of combination: card → other pieces → what the combo does.
    const drawCombo = (comboCards: string[], results: string[], id: string, color: string, delay: number, almost: boolean, angle: number) => {
      const pieces = [focus.name, ...comboCards.filter((n) => cardKey(n) !== cardKey(focus.name))];
      let previous = focus.name;
      pieces.slice(1).forEach((name, pi) => {
        const inDeck = deckNames.find((n) => cardKey(n) === cardKey(name));
        const nodeId = inDeck ?? `missing:${name}`;
        if (!ids.has(nodeId)) {
          nodes.push({
            id: nodeId,
            label: inDeck ? name : `${name} (missing)`,
            kind: inDeck ? "card" : "ghost",
            ring: 2,
            radius: 15,
            angle: angle + (pi - (pieces.length - 2) / 2) * 0.22,
            imageUrl: details.get(inDeck ?? name)?.imageUrl,
          });
          ids.add(nodeId);
        }
        links.push({ id: `${id}:${pi}`, source: previous, target: nodeId, color, width: 2.6, pulse: true, dashed: almost, strength: 1, delay: delay + pi * 0.45 });
        previous = nodeId;
      });
      const resultId = `${id}:result`;
      nodes.push({ id: resultId, label: results[0] ?? "Combo", sublabel: results.length > 1 ? `+${results.length - 1} more` : undefined, kind: "result", ring: 3, radius: 26, angle, color });
      links.push({ id: `${id}:end`, source: previous, target: resultId, color, width: 2.6, pulse: true, dashed: almost, strength: 1, delay: delay + (pieces.length - 1) * 0.45 });
    };

    const included = combos ? combosWith(combos.included, focus.name).slice(0, MAX_COMBOS) : [];
    included.forEach((combo, ci) =>
      drawCombo(combo.cards, combo.results, `combo:${combo.id}`, COMBO_COLORS[ci % COMBO_COLORS.length], 0.8 + ci * 0.3, false, comboAngle(ci)),
    );
    const almost = combos ? combosWith(combos.almostIncluded, focus.name).slice(0, MAX_ALMOST) : [];
    almost.forEach((combo, ci) => {
      // Only combos missing a card other than this one.
      if (piecesInDeck(combo, deckNames).every(Boolean)) return;
      drawCombo(
        combo.cards,
        combo.results,
        `almost:${combo.id}`,
        COMBO_COLORS[(included.length + ci) % COMBO_COLORS.length],
        1.4 + ci * 0.3,
        true,
        comboAngle(included.length + ci),
      );
    });

    return { nodes, links };
  }, [focus, commander, analysis, deckNames, details, combos, pairings]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <NetworkGraph
        nodes={nodes}
        links={links}
        width={900}
        height={600}
        showAllLabels
        label={`${focus.name}'s synergies and combos`}
        onNodeClick={(id) => !id.startsWith("missing:") && id !== focus.name && onOpen(id)}
      />
    </div>
  );
}
