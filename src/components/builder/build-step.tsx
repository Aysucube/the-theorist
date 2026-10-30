"use client";

import { Tabs } from "@base-ui/react/tabs";
import { AnimatePresence } from "motion/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { CATEGORY_COLORS } from "@/components/deck-beta/template-bits";
import type { BuilderGroups, BuilderPick, TemplateShelf } from "@/lib/builder/plan";
import { useCardDetails } from "@/lib/binder/card-cache";
import { CATEGORIES, CATEGORY_INFO, type Category, type DeckProfile } from "@/lib/deck-beta/roles";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { CardDetails } from "@/lib/types";
import { BuildCard } from "./build-card";
import { Meter } from "./deck-rail";

type Tab = Category | "lands";
const LANDS_COLOR = "#8d9bb8";

type PickProps = { ownedFor: (name: string) => number; onAdd: (card: CardDetails) => void };

/**
 * 5. Build: the template is the tabs, each with its meter, and each category
 * lists the cards that fill it in the order to add them: EDHREC's highest
 * synergy, then flexible cards, then the rest. The plan also holds the
 * playstyle's cards and combo pieces; lands get a tab for the mana base. It
 * opens on the category furthest from its target. Adding a card sends it into
 * the deck and the lists re-rank.
 */
export function BuildStep({
  groups,
  profile,
  landTarget,
  ownedFor,
  onAdd,
  spells,
  spellTarget,
  themeName,
  leftOut,
  bracket,
  preferOwned,
  onPickTheme,
  has,
  curveAdvice,
  landAdvice,
}: PickProps & {
  groups: BuilderGroups;
  profile: DeckProfile;
  /** About how many nonbasic lands the commander's colors want. */
  landTarget: number;
  spells: number;
  spellTarget: number;
  themeName?: string;
  leftOut: number;
  bracket: number;
  /** The cards you own lead each list. */
  preferOwned: boolean;
  onPickTheme: () => void;
  /** In the deck already. */
  has: (name: string) => boolean;
  /** What the curve needs, in a line. */
  curveAdvice: string;
  /** What lands the commander's colors want, in a line. */
  landAdvice: string;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    const need = (g: TemplateShelf) => g.short / CATEGORY_INFO[g.category].target;
    return groups.template.reduce((worst, g) => (need(g) > need(worst) ? g : worst)).category;
  });
  const shelf = groups.template.find((g) => g.category === tab);
  const pickProps = { ownedFor, onAdd };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
        <p className="text-muted">
          <span className="font-medium text-foreground tabular-nums">{spells}</span> of {spellTarget} spells
          {spells >= spellTarget && " · the deck is full"}
        </p>
        {leftOut > 0 && <p className="text-xs text-muted">{leftOut} strong cards left out for Bracket {bracket}</p>}
      </div>

      <TemplateTabs
        value={tab}
        onValueChange={setTab}
        items={[
          ...CATEGORIES.map((c) => ({
            value: c,
            label: CATEGORY_INFO[c].label,
            have: profile.categories[c].length,
            target: CATEGORY_INFO[c].target,
            color: CATEGORY_COLORS[c],
            about: CATEGORY_INFO[c].about,
          })),
          { value: "lands" as const, label: "Lands", have: profile.lands, target: landTarget, color: LANDS_COLOR, about: "Nonbasic lands. Basics fill the rest." },
        ]}
      />

      {/* Keyed by the tab, so each list pops in when its tab is picked. */}
      <div key={tab} className="reveal-fast flex flex-col gap-8">
        {shelf && (
          <Shelf shelf={shelf} preferOwned={preferOwned} note={tab === "ramp" || tab === "advantage" ? curveAdvice : undefined} {...pickProps}>
            {tab === "plan" &&
              (themeName ? (
                <Group title={themeName} note={`EDHREC’s best cards for ${themeName} decks.`} picks={groups.playstyle} {...pickProps} />
              ) : (
                <p className="text-sm text-muted">
                  You’re building a balanced deck.{" "}
                  <button type="button" onClick={onPickTheme} className="link text-foreground">
                    Pick a playstyle
                  </button>{" "}
                  to see the cards that suit it.
                </p>
              ))}
            {tab === "plan" && (
              <Group
                title="Complete a combo"
                note="Each of these completes a combo with cards already in the deck, within your bracket."
                picks={groups.combos.map((g) => g.pick)}
                {...pickProps}
              />
            )}
          </Shelf>
        )}
        {tab === "lands" && (
          <Group
            title="Lands"
            note={`${landAdvice} Lands that always enter tapped rank down; basics fill the rest.`}
            picks={groups.lands}
            empty="No lands to suggest for these colors yet."
            {...pickProps}
          />
        )}
      </div>

      <div className="border-t border-line pt-6">
        <AnySearch ownedFor={ownedFor} onAdd={onAdd} has={has} />
      </div>
    </div>
  );
}

/** The template as tabs: each category, how full it is, and its meter. */
function TemplateTabs({
  value,
  onValueChange,
  items,
}: {
  value: Tab;
  onValueChange: (value: Tab) => void;
  items: { value: Tab; label: string; have: number; target: number; color: string; about: string }[];
}) {
  return (
    <Tabs.Root value={value} onValueChange={(next) => onValueChange(next as Tab)}>
      <Tabs.List aria-label="The template" className="relative isolate grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <Tabs.Tab key={item.value} value={item.value} title={item.about} className="template-tab">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 leading-tight">{item.label}</span>
              <span className="text-xs leading-tight tabular-nums">
                <span className="font-semibold text-foreground">{item.have}</span>
                <span className="text-muted">/{item.target}</span>
              </span>
            </span>
            <Meter value={item.have / item.target} color={item.color} className="mt-auto" />
          </Tabs.Tab>
        ))}
        <Tabs.Indicator className="template-tab-indicator" />
      </Tabs.List>
    </Tabs.Root>
  );
}

/** One category's cards in the order to add them. `children` sit between the flexible cards and the rest. */
function Shelf({
  shelf,
  preferOwned,
  note,
  children,
  ...pickProps
}: PickProps & { shelf: TemplateShelf; preferOwned: boolean; note?: string; children?: ReactNode }) {
  const info = CATEGORY_INFO[shelf.category];
  const empty = shelf.synergy.length + shelf.flexible.length + shelf.more.length === 0;
  return (
    <>
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[shelf.category] }} />
          {info.label}
          <span className="text-sm font-normal text-muted">{shelf.short > 0 ? `${shelf.short} to go` : "filled"}</span>
        </h3>
        <p className="text-sm text-muted">
          {info.about} {note}
        </p>
      </div>
      <Group
        title="Highest synergy"
        note={`EDHREC’s highest-synergy cards for your commander${preferOwned ? ", the ones you own first" : ""}.`}
        picks={shelf.synergy}
        {...pickProps}
      />
      <Group title="Flexible" note="Cards that fill two or more parts of the template, most first: one slot doing two jobs." picks={shelf.flexible} {...pickProps} />
      {children}
      <Group title="Also fits" note="The rest, cheaper and more often played first." picks={shelf.more} {...pickProps} />
      {empty && <p className="text-sm text-muted">No cards to suggest here yet. Add more of the commander’s key cards and check back.</p>}
    </>
  );
}

function Group({
  title,
  note,
  picks,
  ownedFor,
  onAdd,
  empty,
}: PickProps & {
  title: string;
  note: string;
  picks: BuilderPick[];
  empty?: string;
}) {
  if (picks.length === 0 && !empty) return null;
  return (
    <section>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mb-4 text-sm text-muted">{note}</p>
      {picks.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {picks.map((p, i) => (
              <BuildCard key={p.card.name} card={p.card} ownedCopies={ownedFor(p.card.name)} categories={p.categories} reason={p.reason} index={i} onAdd={onAdd} />
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
