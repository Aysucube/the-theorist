"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BRACKET_STYLE } from "@/components/deck-beta/bracket-badge";
import { QUADRANT_COLORS } from "@/components/deck-beta/recommendations-panel";
import { bracketLabel, type BracketReport } from "@/lib/deck-beta/bracket";
import { QUADRANT_INFO, QUADRANT_TARGETS, QUADRANTS, ROLE_TARGETS, type DeckProfile } from "@/lib/deck-beta/roles";
import { parseTypeLine } from "@/lib/deck-beta/synergy";
import { DECK_SIZE } from "@/lib/builder/plan";
import type { DraftCommander } from "@/lib/builder/draft";
import type { CardDetails } from "@/lib/types";
import { ColorIdentity } from "../mana";
import { RetryingImage } from "../retrying-image";

/** Cards shown fanned out in the stack; older ones fold into the count. */
const STACK = 7;

const GROUPS = ["Creatures", "Planeswalkers", "Instants", "Sorceries", "Artifacts", "Enchantments", "Battles", "Lands"];
function groupOf(card: CardDetails) {
  const { types } = parseTypeLine(card.typeLine);
  if (types.has("Land")) return "Lands";
  return GROUPS.find((g) => types.has(g.replace(/ies$/, "y").replace(/s$/, ""))) ?? "Other";
}

/**
 * The deck as it comes together: the commander, how full it is, where its
 * cards sit in Quadrant Theory and the jobs they do, its bracket, and the
 * cards themselves — the newest fanned out on a stack they fly into.
 */
export function DeckRail({
  commander,
  cards,
  basics,
  profile,
  report,
  combosFound,
  onRemove,
}: {
  commander?: DraftCommander;
  /** Every card but the commander and basics, newest last. */
  cards: CardDetails[];
  /** Basic lands the deck will fill in. */
  basics: number;
  profile?: DeckProfile;
  report?: BracketReport;
  combosFound?: number;
  onRemove: (name: string) => void;
}) {
  const [listOpen, setListOpen] = useState(false);
  const total = (commander ? 1 : 0) + cards.length + basics;
  const recent = cards.slice(-STACK);

  if (!commander) {
    return (
      <aside className="hidden lg:block">
        <div className="sticky top-20 flex aspect-[488/680] w-full items-center justify-center rounded-[4.75%] border border-dashed border-line-strong p-6 text-center text-sm text-muted">
          Your deck starts with its commander.
        </div>
      </aside>
    );
  }

  return (
    <aside className="no-scrollbar lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 lg:flex-col lg:items-stretch">
          <motion.div
            key={commander.name}
            initial={{ opacity: 0, transform: "scale(0.96)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            transition={{ type: "spring", duration: 0.55, bounce: 0.12 }}
            className="aspect-[488/680] w-24 shrink-0 overflow-hidden rounded-[4.75%] bg-subtle shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)] lg:w-44"
          >
            {commander.imageUrl && <RetryingImage url={commander.imageUrl} alt={commander.name} />}
          </motion.div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{commander.name}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              <ColorIdentity colors={commander.colorIdentity} compact />
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Deck</span>
            <span className="font-medium tabular-nums">
              <NumberFlow value={total} /> <span className="text-muted">/ {DECK_SIZE}</span>
            </span>
          </div>
          <Meter value={total / DECK_SIZE} className="mt-2" />
        </div>

        {profile && (
          <div className="flex flex-col gap-2.5">
            <p className="eyebrow">Quadrants</p>
            {QUADRANTS.map((q) => (
              <div key={q} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-xs">
                <span className="text-muted">{QUADRANT_INFO[q].label}</span>
                <Meter value={profile.quadrants[q].length / QUADRANT_TARGETS[q]} color={QUADRANT_COLORS[q]} />
                <span className="text-right tabular-nums">{profile.quadrants[q].length}</span>
              </div>
            ))}
            <p className="eyebrow mt-2">Jobs</p>
            {(
              [
                ["Ramp", profile.roles.ramp.length, ROLE_TARGETS.ramp!],
                ["Card draw", profile.roles.draw.length, ROLE_TARGETS.draw!],
                ["Removal", profile.roles.removal.length, ROLE_TARGETS.removal!],
                ["Wipes", profile.wipes, ROLE_TARGETS.wipe!],
                ["Protection", profile.roles.protection.length, ROLE_TARGETS.protection!],
              ] as const
            ).map(([label, have, target]) => (
              <div key={label} className="flex items-baseline justify-between text-xs">
                <span className="text-muted">{label}</span>
                <span className={`tabular-nums ${have >= target ? "text-foreground" : "text-muted"}`}>
                  {have} / {target}
                </span>
              </div>
            ))}
          </div>
        )}

        {report && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-0.5 font-medium ${BRACKET_STYLE[report.bracket]}`}>{bracketLabel(report)}</span>
            {combosFound !== undefined && combosFound > 0 && (
              <span className="text-muted">
                {combosFound} {combosFound === 1 ? "combo" : "combos"}
              </span>
            )}
          </div>
        )}

        {cards.length > 0 && (
          <div>
            <div className="relative h-36">
              <AnimatePresence initial={false}>
                {recent.map((card, i) => (
                  <motion.div
                    key={card.name}
                    layoutId={`card:${card.name}`}
                    transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}
                    className="absolute top-0 aspect-[488/680] h-32 overflow-hidden rounded-[4.75%] bg-subtle shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]"
                    style={{ left: `${i * (100 / (STACK + 2))}%`, zIndex: i }}
                    exit={{ opacity: 0, transform: "scale(0.95)", transition: { duration: 0.15 } }}
                  >
                    {card.imageUrl && <RetryingImage url={card.imageUrl} alt={card.name} />}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <button type="button" onClick={() => setListOpen(!listOpen)} aria-expanded={listOpen} className="btn btn-ghost btn-sm -ml-3 text-muted">
              {listOpen ? "Hide the list" : `Show all ${cards.length} cards`}
            </button>
            {listOpen && <DeckList cards={cards} onRemove={onRemove} />}
          </div>
        )}
      </div>
    </aside>
  );
}

function DeckList({ cards, onRemove }: { cards: CardDetails[]; onRemove: (name: string) => void }) {
  const groups = new Map<string, CardDetails[]>();
  for (const card of cards) groups.set(groupOf(card), [...(groups.get(groupOf(card)) ?? []), card]);
  return (
    <div className="reveal-fast mt-2 flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
      {[...GROUPS, "Other"]
        .filter((g) => groups.has(g))
        .map((g) => (
          <div key={g}>
            <p className="eyebrow mb-1">
              {g} <span className="tabular-nums">{groups.get(g)!.length}</span>
            </p>
            <ul>
              {groups
                .get(g)!
                .sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name))
                .map((card) => (
                  <li key={card.name} className="group flex items-center justify-between gap-2 py-0.5 text-xs">
                    <span className="truncate">{card.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(card.name)}
                      aria-label={`Remove ${card.name}`}
                      className="shrink-0 rounded px-1 text-muted opacity-60 hover:text-foreground hover:opacity-100"
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

/** A thin bar filled to `value` (0–1), grown with a transform so it stays smooth. */
export function Meter({ value, color, className = "" }: { value: number; color?: string; className?: string }) {
  return (
    <span className={`block h-1 overflow-hidden rounded-full bg-subtle ${className}`}>
      <span
        className="block h-full origin-left rounded-full bg-accent transition-transform duration-300 ease-out"
        style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})`, background: color }}
      />
    </span>
  );
}
