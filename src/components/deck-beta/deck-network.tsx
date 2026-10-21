"use client";

import { useMemo, useState } from "react";
import { cardKey } from "@/lib/deck-beta/recommend";
import { deckHubs } from "@/lib/deck-beta/playstyle";
import { interactionsOf, parseTypeLine, tagKind, tagLabel, type DeckAnalysis } from "@/lib/deck-beta/synergy";
import { formatCount } from "@/lib/format";
import type { CardDetails, Combo } from "@/lib/types";
import { NetworkGraph, type GraphLink, type GraphNode } from "./network-graph";

/** Playstyle hub colors, then combo colors. */
export const HUB_COLORS = ["#8b5cf6", "#0ea5e9", "#f43f5e", "#14b8a6", "#eab308", "#f97316"];
export const COMBO_COLORS = ["#22c55e", "#ec4899", "#06b6d4", "#facc15", "#a855f7", "#fb7185", "#4ade80", "#38bdf8"];
const COMMANDER_COLOR = "#f59e0b";

/**
 * The whole deck as a network: the commander in the middle, the deck's
 * playstyles around it, and every card linked to the playstyles it feeds or
 * rewards. Cards that work with the commander link to it; combos run as
 * coloured chains through their pieces. Click a card for its own network.
 */
export function DeckNetwork({
  commander,
  cards,
  analysis,
  combos,
  onOpen,
}: {
  commander?: CardDetails;
  cards: CardDetails[];
  analysis: DeckAnalysis;
  combos: Combo[];
  onOpen: (name: string) => void;
}) {
  const [shownCombo, setShownCombo] = useState<string | null>(null);
  const hubs = useMemo(() => deckHubs(analysis, 6), [analysis]);

  const { nodes, links, comboPieces, hiddenLands } = useMemo(() => {
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
        radius: 27,
        angle: hubAngle(i),
        pinned: true,
        color: HUB_COLORS[i % HUB_COLORS.length],
      });
      links.push({ id: `${id}>center`, source: centerId, target: id, color: HUB_COLORS[i % HUB_COLORS.length], width: 3, pulse: true, strength: 1, delay: 0.2 + i * 0.1 });
    });

    const commanderTraits = commander ? analysis.traits.get(commander.name) : undefined;
    const withCommander = commanderTraits
      ? new Set(
          [...interactionsOf(commanderTraits, analysis.traits, commander!.name).uses, ...interactionsOf(commanderTraits, analysis.traits, commander!.name).usedBy]
            .filter((l) => tagKind(l.tag) !== "type")
            .flatMap((l) => l.cards),
        )
      : new Set<string>();

    // Each card joins up to two playstyles, rewarding ones first.
    const comboKeys = new Set(combos.flatMap((c) => c.cards.map(cardKey)));
    let hiddenLands = 0;
    const primary = (card: CardDetails) =>
      hubs.findIndex((hub) => hub.payoffs.includes(card.name)) >= 0
        ? hubs.findIndex((hub) => hub.payoffs.includes(card.name))
        : hubs.findIndex((hub) => hub.cards.includes(card.name));
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
      if (!linked && !comboKeys.has(cardKey(card.name)) && parseTypeLine(card.typeLine).types.has("Land")) {
        hiddenLands++;
        continue;
      }
      const angle = linked ? angleOf.get(card.name) : undefined;
      nodes.push({
        id: card.name,
        label: card.name,
        kind: "card",
        ring: linked ? 2 + (staggered.get(card.name) ?? 0) : 3.2,
        radius: linked ? 11 + Math.min(5, memberOf.length * 2 + (withCommander.has(card.name) ? 2 : 0)) : 9,
        angle,
        imageUrl: card.imageUrl,
        color: memberOf.length > 0 ? HUB_COLORS[memberOf[0].i % HUB_COLORS.length] : withCommander.has(card.name) ? COMMANDER_COLOR : "#71717a",
        faint: !linked,
      });
      for (const { hub, i } of memberOf) {
        links.push({ id: `${card.name}>hub:${hub.tag}`, source: `hub:${hub.tag}`, target: card.name, color: HUB_COLORS[i % HUB_COLORS.length], width: 1, strength: 0.6, delay: 0.6 });
      }
      if (withCommander.has(card.name)) {
        links.push({ id: `${card.name}>center`, source: centerId, target: card.name, color: COMMANDER_COLOR, width: 1.3, strength: 0.3, delay: 0.8, title: `Works with ${commander!.name}` });
      }
    }

    // Combos: a coloured chain through their pieces, signals running along it in order.
    const present = new Map(nodes.map((n) => [cardKey(n.id), n.id]));
    const comboPieces = new Map<string, Set<string>>();
    combos.forEach((combo, ci) => {
      const color = COMBO_COLORS[ci % COMBO_COLORS.length];
      const pieces = combo.cards.map((n) => present.get(cardKey(n)) ?? (commander && cardKey(n) === cardKey(commander.name) ? centerId : undefined)).filter((n): n is string => Boolean(n));
      comboPieces.set(combo.id, new Set(pieces));
      pieces.slice(1).forEach((piece, pi) => {
        links.push({
          id: `combo:${combo.id}:${pi}`,
          source: pieces[pi],
          target: piece,
          color,
          width: 2.6,
          pulse: true,
          strength: 0.9,
          delay: 1 + pi * 0.35,
          title: `Combo: ${combo.results.slice(0, 2).join(", ")}`,
        });
      });
    });
    return { nodes, links, comboPieces, hiddenLands };
  }, [commander, cards, analysis, hubs, combos]);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
        <NetworkGraph
          nodes={nodes}
          links={links}
          label="Your deck as a network of playstyles, synergies and combos"
          highlight={shownCombo ? comboPieces.get(shownCombo) : undefined}
          onNodeClick={(id) => id !== "__deck" && onOpen(id)}
        />
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Playstyles</span>
          {hubs.length === 0 && <span className="text-zinc-500">None stand out yet.</span>}
          {hubs.map((hub, i) => (
            <span key={hub.tag} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-0.5 dark:border-zinc-800">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: HUB_COLORS[i % HUB_COLORS.length] }} />
              {tagLabel(hub.tag)}
              <span className="text-xs text-zinc-500 tabular-nums">
                {formatCount(hub.payoffs.length)} payoffs · {formatCount(hub.enablers.length)} enablers
              </span>
            </span>
          ))}
        </div>
        {combos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Combos</span>
            {combos.map((combo, i) => (
              <button
                key={combo.id}
                type="button"
                onMouseEnter={() => setShownCombo(combo.id)}
                onMouseLeave={() => setShownCombo(null)}
                onFocus={() => setShownCombo(combo.id)}
                onBlur={() => setShownCombo(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-0.5 hover:border-amber-500 dark:border-zinc-800"
                title={combo.cards.join(" + ")}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: COMBO_COLORS[i % COMBO_COLORS.length] }} />
                {combo.results[0] ?? "Combo"}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-500">
          Hover a card or combo to light up its links; click a card to open its own network.
          {hiddenLands > 0 && ` ${formatCount(hiddenLands)} lands that don’t link to anything aren’t shown.`} Faint cards
          on the edge don’t link to the deck’s playstyles or commander.
        </p>
      </div>
    </div>
  );
}
