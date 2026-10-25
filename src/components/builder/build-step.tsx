"use client";

import { AnimatePresence } from "motion/react";
import { useEffect, useId, useState } from "react";
import { QUADRANT_COLORS } from "@/components/deck-beta/recommendations-panel";
import type { BuilderGroups, BuilderPick } from "@/lib/builder/plan";
import { useCardDetails } from "@/lib/binder/card-cache";
import { QUADRANT_INFO } from "@/lib/deck-beta/roles";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { CardDetails } from "@/lib/types";
import { TabBar } from "../theme/tabs";
import { BuildCard } from "./build-card";

const TABS = ["Next up", "Quadrants", "Consistency", "Combos", "Playstyle", "Lands", "Binder", "Search"] as const;
type Tab = (typeof TABS)[number];

/**
 * 5. Build: recommendations for the deck as it stands, grouped by what they'd
 * do for it. Adding a card sends it into the deck and the groups re-rank.
 */
export function BuildStep({
  groups,
  ownedFor,
  onAdd,
  spells,
  spellTarget,
  themeName,
  leftOut,
  bracket,
  onPickTheme,
  has,
}: {
  groups: BuilderGroups;
  ownedFor: (name: string) => number;
  onAdd: (card: CardDetails) => void;
  spells: number;
  spellTarget: number;
  themeName?: string;
  leftOut: number;
  bracket: number;
  onPickTheme: () => void;
  /** In the deck already. */
  has: (name: string) => boolean;
}) {
  const [tab, setTab] = useState<Tab>("Next up");
  const counts: Partial<Record<Tab, number>> = {
    Combos: groups.combos.length,
    Playstyle: groups.playstyle.length,
    Lands: groups.lands.length,
    Binder: groups.binder.length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
        <p className="text-muted">
          <span className="font-medium text-foreground tabular-nums">{spells}</span> of {spellTarget} spells
          {spells >= spellTarget && " · the deck is full"}
        </p>
        {leftOut > 0 && <p className="text-xs text-muted">{leftOut} strong cards left out for Bracket {bracket}</p>}
      </div>

      <TabBar
        label="Recommendations"
        value={tab}
        onValueChange={setTab}
        className="no-scrollbar overflow-x-auto"
        items={TABS.map((t) => ({
          value: t,
          label: (
            <>
              {t}
              {counts[t] ? <span className="text-[11px] tabular-nums opacity-60">{counts[t]}</span> : null}
            </>
          ),
        }))}
      />

      {/* Keyed by the tab, so each group pops in when its tab is picked. */}
      <div key={tab} className="reveal-fast flex flex-col gap-6">
        {tab === "Next up" && (
          <>
            <Group title="Next up" note="The cards that would help the deck most right now: its biggest gaps first." picks={groups.next} ownedFor={ownedFor} onAdd={onAdd} />
            <Group
              title={bracket >= 4 ? "Stronger cards" : "Game Changers you have room for"}
              note={bracket >= 4 ? "Game Changers, tutors, fast mana and free spells." : "Bracket 3 allows up to three."}
              picks={groups.power}
              ownedFor={ownedFor}
              onAdd={onAdd}
            />
          </>
        )}
        {tab === "Quadrants" && (
          <>
            <Group title="Flexible" note="Cards that fit two or more quadrants: good in more of your games." picks={groups.flexible} ownedFor={ownedFor} onAdd={onAdd} />
            {groups.quadrants.map((g) => (
              <Group
                key={g.quadrant}
                title={`${QUADRANT_INFO[g.quadrant].label} · ${g.short} short`}
                dot={QUADRANT_COLORS[g.quadrant]}
                note={`${QUADRANT_INFO[g.quadrant].question} ${QUADRANT_INFO[g.quadrant].examples}.`}
                picks={g.picks}
                ownedFor={ownedFor}
                onAdd={onAdd}
              />
            ))}
            {groups.quadrants.length === 0 && <p className="text-sm text-muted">Every quadrant is covered.</p>}
          </>
        )}
        {tab === "Consistency" && (
          <>
            <Group title="Card draw and tutors" note="See more of your deck and find the card you need." picks={groups.consistency} ownedFor={ownedFor} onAdd={onAdd} />
            <Group title="Ramp" note="Get ahead on mana: about ten is a good start." picks={groups.ramp} ownedFor={ownedFor} onAdd={onAdd} />
          </>
        )}
        {tab === "Combos" && (
          <Group
            title="Complete a combo"
            note="Each of these completes a combo with cards already in the deck, within your bracket. EDHREC’s combos for the commander come first."
            picks={groups.combos.map((g) => g.pick)}
            ownedFor={ownedFor}
            onAdd={onAdd}
            empty="No combo is one card away yet. Add more of the commander’s key cards and check back."
          />
        )}
        {tab === "Playstyle" &&
          (themeName ? (
            <Group title={themeName} note={`EDHREC’s best cards for ${themeName} decks, the ones you own first.`} picks={groups.playstyle} ownedFor={ownedFor} onAdd={onAdd} />
          ) : (
            <p className="text-sm text-muted">
              You’re building a balanced deck.{" "}
              <button type="button" onClick={onPickTheme} className="link text-foreground">
                Pick a playstyle
              </button>{" "}
              to see the cards that suit it.
            </p>
          ))}
        {tab === "Lands" && (
          <Group title="Lands" note="Lands beyond the basics: EDHREC’s for the commander and any in your binder. Basics fill the rest." picks={groups.lands} ownedFor={ownedFor} onAdd={onAdd} />
        )}
        {tab === "Binder" && (
          <Group
            title="From your binder"
            note="Cards you own that do a job here, whether or not EDHREC lists them."
            picks={groups.binder}
            ownedFor={ownedFor}
            onAdd={onAdd}
            empty="Nothing in your binder fits this commander yet."
          />
        )}
        {tab === "Search" && <AnySearch ownedFor={ownedFor} onAdd={onAdd} has={has} />}
      </div>
    </div>
  );
}

function Group({
  title,
  note,
  picks,
  ownedFor,
  onAdd,
  dot,
  empty,
}: {
  title: string;
  note: string;
  picks: BuilderPick[];
  ownedFor: (name: string) => number;
  onAdd: (card: CardDetails) => void;
  dot?: string;
  empty?: string;
}) {
  if (picks.length === 0 && !empty) return null;
  return (
    <section>
      <h3 className="flex items-center gap-2 font-semibold">
        {dot && <span aria-hidden className="size-2 rounded-full" style={{ background: dot }} />}
        {title}
      </h3>
      <p className="mb-4 text-sm text-muted">{note}</p>
      {picks.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {picks.map((p, i) => (
              <BuildCard key={p.card.name} card={p.card} ownedCopies={ownedFor(p.card.name)} roles={p.roles} reason={p.reason} index={i} onAdd={onAdd} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

/** Any card by name. */
function AnySearch({ ownedFor, onAdd, has }: { ownedFor: (name: string) => number; onAdd: (card: CardDetails) => void; has: (name: string) => boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const { detailsFor } = useCardDetails(names);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void fetchJsonWithRetry<{ names?: string[] }>(`/api/autocomplete?q=${encodeURIComponent(q)}`, { busyReason: "Scryfall is busy" }).then((r) => {
        if (r !== "error") setNames((r.names ?? []).slice(0, 8));
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const found = query.trim().length >= 2 ? names.map(detailsFor).filter((d): d is CardDetails => Boolean(d) && !has(d!.name)) : [];
  return (
    <section className="flex flex-col gap-4">
      <div>
        <label htmlFor={id} className="font-semibold">
          Any card
        </label>
        <p className="text-sm text-muted">Search for a card the recommendations haven’t shown.</p>
      </div>
      <input id={id} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Card name" className="field h-10 max-w-sm" />
      {found.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {found.map((card, i) => (
              <BuildCard key={card.name} card={card} ownedCopies={ownedFor(card.name)} index={i} onAdd={onAdd} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
