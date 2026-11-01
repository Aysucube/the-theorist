"use client";

import { Tabs } from "@base-ui/react/tabs";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_COLORS } from "@/components/deck-beta/template-bits";
import { MAX_PLAYSTYLES, type DraftPlaystyle } from "@/lib/builder/draft";
import { allOffered, byCardType, fitsIdentity, searchCards, type BuilderGroups, type BuilderPick, type LandShelf, type TemplateShelf } from "@/lib/builder/plan";
import { useCardDetails } from "@/lib/binder/card-cache";
import { CURVE_LABELS, slotOf } from "@/lib/deck-beta/curve";
import { CATEGORIES, CATEGORY_INFO, type Category, type DeckProfile } from "@/lib/deck-beta/roles";
import { fetchJsonWithRetry } from "@/lib/retry";
import { formatCount } from "@/lib/format";
import type { CardDetails, EdhrecTheme } from "@/lib/types";
import { ArrowDownIcon } from "../theme/icons";
import { BuildCard } from "./build-card";
import { Meter } from "./deck-rail";
import { usePlaystyleHover, type PlaystyleContext } from "./playstyle-hover";

type Tab = Category | "lands";
const LANDS_COLOR = "#8d9bb8";
/** Letters a search needs before it looks anything up. */
const SEARCH_FROM = 2;
/** Cards shown for a cost picked on the mana curve. */
const COST_CARDS = 24;

type PickProps = { ownedFor: (name: string) => number; onAdd: (card: CardDetails) => void };

/**
 * 6. Build: the template is the tabs, each with its meter, and each category
 * lists everything EDHREC has that fills it, the way EDHREC lays it out: New
 * Cards, Top Cards, High Lift, then by card type, after the cards that set the
 * chosen playstyles apart, with cards their decks don't play last. The plan
 * also holds combo pieces; the lands tab shows the basics that come with the
 * deck and the dual lands and others to add on top. It opens on the category
 * furthest from its target. Adding a card sends it into the deck and the lists
 * re-rank. A dropdown switches playstyles at any point, a search above the tabs
 * finds any card, and clicking a cost on the mana curve narrows the tab to its
 * most synergistic cards at that cost.
 */
export function BuildStep({
  groups,
  profile,
  landTarget,
  lands,
  basicSplit,
  ownedFor,
  onAdd,
  spells,
  spellTarget,
  curvePick,
  onClearCurvePick,
  themes,
  chosen,
  themeName,
  onToggleTheme,
  onClearThemes,
  playstyleContext,
  styleLoading,
  styleFailed,
  onRetryStyle,
  leftOut,
  bracket,
  preferOwned,
  has,
  curveAdvice,
  landAdvice,
}: PickProps & {
  groups: BuilderGroups;
  profile: DeckProfile;
  /** About how many nonbasic lands the commander's colors want. */
  landTarget: number;
  /** Lands to run, basics and others together. */
  lands: number;
  /** The basics that come with the deck, by name. */
  basicSplit: Record<string, number>;
  spells: number;
  spellTarget: number;
  /** The mana curve slot clicked, if any. */
  curvePick?: number;
  onClearCurvePick: () => void;
  /** Every playstyle of the commander on EDHREC, most decks first. */
  themes: EdhrecTheme[];
  /** The playstyles chosen; none for a balanced deck. */
  chosen: DraftPlaystyle[];
  /** Their names together, e.g. "Tokens + Elves". */
  themeName?: string;
  onToggleTheme: (theme: DraftPlaystyle) => void;
  onClearThemes: () => void;
  playstyleContext: PlaystyleContext;
  /** The chosen playstyles' decks are still being read. */
  styleLoading: boolean;
  styleFailed: boolean;
  onRetryStyle: () => void;
  leftOut: number;
  bracket: number;
  /** The cards you own lead each list. */
  preferOwned: boolean;
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
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const searching = query.trim().length >= SEARCH_FROM;
  const offered = useMemo(() => allOffered(groups), [groups]);

  // The chart stays beside the lists (or far above them on a phone): bring the cards into view.
  useEffect(() => {
    if (curvePick === undefined || !panel.current) return;
    const { top } = panel.current.getBoundingClientRect();
    if (top < 64 || top > window.innerHeight * 0.6) panel.current.scrollIntoView({ block: "start" });
  }, [curvePick]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {themes.length > 0 && <PlaystyleMenu themes={themes} chosen={chosen} onToggle={onToggleTheme} onClear={onClearThemes} context={playstyleContext} />}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards" aria-label="Search cards" className="field h-9 min-w-40 flex-1" />
        <div className="ml-auto text-right">
          <p className="text-muted">
            <span className="font-medium text-foreground tabular-nums">{spells}</span> of {spellTarget} spells
            {spells >= spellTarget && " · the deck is full"}
          </p>
          {leftOut > 0 && (
            <p className="text-xs text-muted">
              {leftOut} strong cards left out for Bracket {bracket}
            </p>
          )}
        </div>
      </div>

      {styleLoading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="spinner size-4" /> Reading EDHREC’s {themeName} decks…
        </p>
      )}
      {styleFailed && (
        <p className="text-sm text-muted">
          Couldn’t read EDHREC’s {themeName} decks.{" "}
          <button type="button" onClick={onRetryStyle} className="link text-foreground">
            Try again
          </button>
        </p>
      )}

      <TemplateTabs
        value={tab}
        onValueChange={(next) => {
          setTab(next);
          setQuery("");
        }}
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

      {searching ? (
        <CardSearch query={query} offered={offered} identity={playstyleContext.colors} has={has} {...pickProps} />
      ) : (
        // Keyed by what it shows, so each list pops in when it's picked.
        <div key={`${tab}:${curvePick}`} ref={panel} className="reveal-fast flex scroll-mt-20 flex-col gap-4">
          {shelf && curvePick !== undefined && <CostShelf shelf={shelf} slot={curvePick} themeName={themeName} onClear={onClearCurvePick} {...pickProps} />}
          {shelf && curvePick === undefined && (
            <Shelf
              shelf={shelf}
              preferOwned={preferOwned}
              themeName={themeName}
              note={tab === "ramp" || tab === "advantage" ? curveAdvice : undefined}
              combos={tab === "plan" ? groups.combos.map((g) => g.pick) : []}
              bracket={bracket}
              {...pickProps}
            />
          )}
          {tab === "lands" && (
            <>
              <div>
                <h3 className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: LANDS_COLOR }} />
                  Lands
                  <span className="text-sm font-normal text-muted">{profile.lands < landTarget ? `${landTarget - profile.lands} to go` : "filled"}</span>
                </h3>
                <p className="text-sm text-muted">{landAdvice}</p>
              </div>
              {curvePick !== undefined && (
                <p className="text-sm text-muted">
                  Lands don’t cost mana, so this tab stays as it is. Pick another tab to see its cards at {CURVE_LABELS[curvePick]} mana.
                </p>
              )}
              <BasicsInDeck split={basicSplit} lands={lands} />
              <LandGroups lands={groups.lands} preferOwned={preferOwned} jumps {...pickProps} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The commander's playstyles in a dropdown, up to three at a time; hovering one shows what it does and how it wins. */
function PlaystyleMenu({
  themes,
  chosen,
  onToggle,
  onClear,
  context,
}: {
  themes: EdhrecTheme[];
  chosen: DraftPlaystyle[];
  onToggle: (theme: DraftPlaystyle) => void;
  onClear: () => void;
  context: PlaystyleContext;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const shown = themes.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));
  const full = chosen.length >= MAX_PLAYSTYLES;

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={box} className="relative min-w-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="btn btn-secondary h-9 max-w-full gap-2 px-3">
        <span className="text-muted">Playstyle</span>
        <span className="min-w-0 truncate">{chosen.length > 0 ? chosen.map((t) => t.name).join(" + ") : "Balanced"}</span>
        <ArrowDownIcon className={`size-4 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pop-in absolute top-full left-0 z-30 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-xl border border-line-strong bg-surface p-3 shadow-[0_24px_60px_-16px_rgb(0_0_0/0.75),0_0_40px_-16px_rgb(90_176_255/0.3)] [--transform-origin:left_top]">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter playstyles" aria-label="Filter playstyles" className="field h-8 text-xs" />
          <p className="text-xs text-muted">
            Pick up to {MAX_PLAYSTYLES}. Hover one to see how it wins.
          </p>
          <div role="group" aria-label="Playstyles" className="no-scrollbar flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            <PlaystyleRow name="Balanced" checked={chosen.length === 0} onToggle={onClear} context={context} />
            {shown.map((t) => {
              const checked = chosen.some((c) => c.slug === t.slug);
              return <PlaystyleRow key={t.slug} slug={t.slug} name={t.name} decks={t.numDecks} checked={checked} locked={full && !checked} onToggle={() => onToggle({ slug: t.slug, name: t.name })} context={context} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PlaystyleRow({
  slug,
  name,
  decks,
  checked,
  locked = false,
  onToggle,
  context,
}: {
  slug?: string;
  name: string;
  decks?: number;
  checked: boolean;
  /** Three are chosen already. */
  locked?: boolean;
  onToggle: () => void;
  context: PlaystyleContext;
}) {
  const { trigger, preview } = usePlaystyleHover({ slug, name }, context);
  return (
    <>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={locked}
        {...trigger}
        onClick={() => {
          if (!locked) onToggle();
        }}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 ${locked ? "cursor-not-allowed text-muted/60" : "hover:bg-subtle"}`}
      >
        <span aria-hidden className={`flex size-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${checked ? "border-accent bg-accent text-on-accent" : "border-line-strong"}`}>
          {checked && "✓"}
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {decks !== undefined && <span className="shrink-0 text-[11px] text-muted tabular-nums">{formatCount(decks)}</span>}
      </button>
      {preview}
    </>
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

/** One category's cards at the cost picked on the mana curve, the most synergistic first. */
function CostShelf({ shelf, slot, themeName, onClear, ...pickProps }: PickProps & { shelf: TemplateShelf; slot: number; themeName?: string; onClear: () => void }) {
  const info = CATEGORY_INFO[shelf.category];
  const cost = CURVE_LABELS[slot];
  const at = (picks: BuilderPick[]) => picks.filter((p) => slotOf(p.card.cmc) === slot);
  const leaning = at(shelf.all.leaning);
  const synergy = at(shelf.all.synergy);
  const rest = at(shelf.all.rest);
  const total = leaning.length + synergy.length + rest.length;
  // Up to COST_CARDS in all, from the top down.
  const shownLeaning = leaning.slice(0, COST_CARDS);
  const shownSynergy = synergy.slice(0, COST_CARDS - shownLeaning.length);
  const shownRest = rest.slice(0, COST_CARDS - shownLeaning.length - shownSynergy.length);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-x-2 font-semibold">
            <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[shelf.category] }} />
            {info.label} at {cost} mana
            <span className="text-sm font-normal text-muted">
              {total} {total === 1 ? "card" : "cards"}
            </span>
          </h3>
          <p className="text-sm text-muted">The most synergistic at this cost, in your binder or not.</p>
        </div>
        <button type="button" onClick={onClear} className="btn btn-ghost btn-sm text-muted">
          Show all {info.label}
        </button>
      </div>
      {total === 0 && (
        <p className="text-sm text-muted">
          No {info.label} cards at {cost} mana to suggest right now.
        </p>
      )}
      <Group title={`Best for ${themeName}`} note={`What sets ${themeName} decks apart at this cost, furthest first.`} picks={shownLeaning} flies={false} {...pickProps} />
      <Group title="Highest synergy" note={`EDHREC’s highest-synergy cards for ${themeName ? `${themeName} decks` : "your commander"} at this cost.`} picks={shownSynergy} {...pickProps} />
      <Group title="Also fits" note="The rest at this cost." picks={shownRest} {...pickProps} />
    </>
  );
}

/** One category's cards, laid out like EDHREC's page for the commander, each list its own section. */
function Shelf({
  shelf,
  preferOwned,
  themeName,
  note,
  combos,
  bracket,
  ...pickProps
}: PickProps & { shelf: TemplateShelf; preferOwned: boolean; themeName?: string; note?: string; combos: BuilderPick[]; bracket: number }) {
  const info = CATEGORY_INFO[shelf.category];
  const empty = shelf.lists.length + shelf.moreForStyle.length + shelf.outside.length + shelf.heldBack.length === 0;
  const owned = preferOwned ? ", the ones you own first" : "";
  const best = `Best for ${themeName}`;
  const comboTitle = "Complete a combo";
  const moreTitle = `More for ${themeName}`;
  const outsideTitle = themeName ? "Outside the playstyle" : "From your binder";
  const heldTitle = `Left out for Bracket ${bracket}`;
  return (
    <>
      <div className="mb-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[shelf.category] }} />
          {info.label}
          <span className="text-sm font-normal text-muted">{shelf.short > 0 ? `${shelf.short} to go` : "filled"}</span>
        </h3>
        <p className="text-sm text-muted">
          {info.about} {note}
        </p>
      </div>
      <SectionJumps
        sections={[
          { title: best, count: shelf.leaning.length },
          ...shelf.lists.map((l) => ({ title: l.title, count: l.picks.length })),
          { title: comboTitle, count: combos.length },
          { title: moreTitle, count: shelf.moreForStyle.length },
          { title: outsideTitle, count: shelf.outside.length },
          { title: heldTitle, count: shelf.heldBack.length },
        ]}
      />
      <Group title={best} note={`What sets ${themeName} decks apart: the ones they lean on most${owned}. They’re in EDHREC’s lists below too.`} picks={shelf.leaning} flies={false} {...pickProps} />
      {shelf.lists.map((list) => (
        <Group key={list.title} title={list.title} note={LIST_NOTES[list.title] ?? "EDHREC’s list, the highest synergy first."} picks={list.picks} {...pickProps} />
      ))}
      <Group title={comboTitle} note="Each of these completes a combo with cards already in the deck, within your bracket." picks={combos} {...pickProps} />
      <Group title={moreTitle} note={`${themeName} cards in your colors that these commander’s decks haven’t picked up${owned}.`} picks={shelf.moreForStyle} byType {...pickProps} />
      <Group
        title={outsideTitle}
        note={themeName ? `These do the job, but ${themeName} decks on EDHREC don’t usually play them.` : "These do the job, but EDHREC doesn’t list them for this commander."}
        picks={shelf.outside}
        byType
        {...pickProps}
      />
      <Group title={heldTitle} note="Too strong for your bracket, so they’re set apart. Add one only if you mean to." picks={shelf.heldBack} byType {...pickProps} />
      {empty && <p className="text-sm text-muted">No cards to suggest here yet. Add more of the commander’s key cards and check back.</p>}
    </>
  );
}

const sectionId = (title: string) => `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** Shortcuts to a tab's sections, staying in view as they scroll past. */
function SectionJumps({ sections }: { sections: { title: string; count: number }[] }) {
  const shown = sections.filter((s) => s.count > 0);
  if (shown.length < 2) return null;
  return (
    <nav aria-label="Sections" className="no-scrollbar sticky top-14 z-20 -mx-1 flex gap-1.5 overflow-x-auto bg-background/85 px-1 py-2 backdrop-blur">
      {shown.map((s) => (
        <button key={s.title} type="button" onClick={() => document.getElementById(sectionId(s.title))?.scrollIntoView({ block: "start" })} className="pill shrink-0">
          {s.title}
          <span className="text-[11px] tabular-nums opacity-60">{formatCount(s.count)}</span>
        </button>
      ))}
    </nav>
  );
}

const LIST_NOTES: Record<string, string> = {
  "New Cards": "Recently printed cards EDHREC is seeing in these decks.",
  "Top Cards": "What these decks play most, the most played first.",
  "High Lift Cards": "Cards these decks play far more than you’d expect.",
  "High Synergy Cards": "Cards that suit these decks far more than others of their colors.",
};

/** The basics the deck is filled out with, as they stand. */
function BasicsInDeck({ split, lands }: { split: Record<string, number>; lands: number }) {
  const entries = Object.entries(split);
  const basics = entries.reduce((sum, [, n]) => sum + n, 0);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="eyebrow">Comes with the deck</p>
      <p className="mt-1 text-sm tabular-nums">
        {basics} basic {basics === 1 ? "land" : "lands"}
        {entries.length > 0 && `: ${entries.map(([name, n]) => `${n} ${name}`).join(", ")}`}
      </p>
      <p className="mt-1 text-sm text-muted">Each land you add takes a basic’s place, so the deck stays at {lands} lands.</p>
    </div>
  );
}

/** The lands to add on top of the basics, dual lands first. */
function LandGroups({ lands, preferOwned, jumps = false, ...pickProps }: PickProps & { lands: LandShelf; preferOwned: boolean; jumps?: boolean }) {
  if (lands.duals.length + lands.fixing.length + lands.utility.length + lands.slow.length === 0) {
    return <p className="text-sm text-muted">No lands to suggest for these colors yet.</p>;
  }
  return (
    <>
      {jumps && (
        <SectionJumps
          sections={[
            { title: "Dual lands", count: lands.duals.length },
            { title: "More fixing", count: lands.fixing.length },
            { title: "Utility lands", count: lands.utility.length },
            { title: "Enter tapped", count: lands.slow.length },
          ]}
        />
      )}
      <Group
        title="Dual lands"
        note={`Make two or more of your colors and enter untapped, or usually do. The ones EDHREC’s decks play most come first${preferOwned ? ", after the ones you own" : ""}.`}
        picks={lands.duals}
        {...pickProps}
      />
      <Group title="More fixing" note="Fetch lands, triomes, bounce lands and lands that tap for any color." picks={lands.fixing} {...pickProps} />
      <Group title="Utility lands" note="Lands that do more than make mana." picks={lands.utility} {...pickProps} />
      <Group title="Enter tapped" note="Slower, so they come last: a basic is often better." picks={lands.slow} {...pickProps} />
    </>
  );
}

/** The Lands step's recommendations, for picking them as the mana base is set. */
export function RecommendedLands({ lands, preferOwned, ...pickProps }: PickProps & { lands: LandShelf; preferOwned: boolean }) {
  return (
    <div className="mt-10 flex flex-col gap-4 border-t border-line pt-8">
      <div>
        <h3 className="font-semibold">Recommended lands</h3>
        <p className="text-sm text-muted">On top of the basics that come with the deck. Each one you add takes a basic’s place.</p>
      </div>
      <LandGroups lands={lands} preferOwned={preferOwned} {...pickProps} />
    </div>
  );
}

/** What a card section needs of each card. */
type SectionCard = { card: CardDetails; categories?: Category[]; reason?: string };

/** A section of cards with its title and count, which folds away. With `byType`, a mix of card types is split up inside it. */
function Group({
  title,
  note,
  picks,
  byType = false,
  flies = true,
  ownedFor,
  onAdd,
}: PickProps & {
  title: string;
  note?: string;
  picks: SectionCard[];
  byType?: boolean;
  /** Off for a section whose cards also show in another, so only one copy flies into the deck. */
  flies?: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (picks.length === 0) return null;
  const types = byType ? byCardType(picks) : [];
  const grid = (cards: SectionCard[]) => (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence mode="popLayout" initial={false}>
        {cards.map((p, i) => (
          <BuildCard key={p.card.name} card={p.card} ownedCopies={ownedFor(p.card.name)} categories={p.categories} reason={p.reason} index={i} flies={flies} onAdd={onAdd} />
        ))}
      </AnimatePresence>
    </ul>
  );
  return (
    <section id={sectionId(title)} className="scroll-mt-28 rounded-2xl border border-line bg-surface/40 p-4">
      <h4>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left text-sm font-semibold">
          <span className="min-w-0">{title}</span>
          <span className="font-normal text-muted tabular-nums">{formatCount(picks.length)}</span>
          <ArrowDownIcon className={`ml-auto size-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        </button>
      </h4>
      {open && (
        <div className="reveal-fast mt-1 flex flex-col gap-4">
          {note && <p className="text-sm text-muted">{note}</p>}
          {types.length > 1
            ? types.map((part) => (
                <div key={part.type} className="flex flex-col gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
                  <h5 className="eyebrow">
                    {part.type} <span className="tabular-nums">{part.picks.length}</span>
                  </h5>
                  {grid(part.picks)}
                </div>
              ))
            : grid(picks)}
        </div>
      )}
    </section>
  );
}

/** What a search finds, by card type: the suggestions it matches, by name or rules text, then any other card in the commander's colors. */
function CardSearch({
  query,
  offered,
  identity,
  has,
  ownedFor,
  onAdd,
}: PickProps & {
  query: string;
  offered: BuilderPick[];
  identity: string[];
  /** In the deck already. */
  has: (name: string) => boolean;
}) {
  const [names, setNames] = useState<string[]>([]);
  const { detailsFor } = useCardDetails(names);
  const pickProps = { ownedFor, onAdd };

  useEffect(() => {
    const q = query.trim();
    const timer = window.setTimeout(() => {
      void fetchJsonWithRetry<{ names?: string[] }>(`/api/autocomplete?q=${encodeURIComponent(q)}`, { busyReason: "Scryfall is busy" }).then((r) => {
        if (r !== "error") setNames((r.names ?? []).slice(0, 12));
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const matches = searchCards(offered, query);
  const listed = new Set(offered.map((p) => p.card.name));
  const looked = names.map(detailsFor).filter((d): d is CardDetails => Boolean(d));
  const others = looked.filter((d) => !has(d.name) && !listed.has(d.name) && fitsIdentity(d, identity)).map((card) => ({ card }));
  const inDeck = looked.filter((d) => has(d.name)).map((d) => d.name);
  const offColor = looked.filter((d) => !fitsIdentity(d, identity)).map((d) => d.name);

  return (
    <div className="reveal-fast flex flex-col gap-4">
      <div className="text-sm text-muted" role="status">
        <p>{matches.length + others.length === 0 ? `Nothing to add for “${query.trim()}”.` : `${formatCount(matches.length)} of your suggestions match “${query.trim()}”, by name or rules text.`}</p>
        {inDeck.length > 0 && <p>Already in your deck: {inDeck.slice(0, 3).join(", ")}.</p>}
        {offColor.length > 0 && <p>Outside your commander’s colors: {offColor.slice(0, 3).join(", ")}.</p>}
      </div>
      {byCardType(matches).map((part) => (
        <Group key={part.type} title={part.type} picks={part.picks} {...pickProps} />
      ))}
      <Group title="Any other card" note="Not among your suggestions, but in your commander’s colors." picks={others} {...pickProps} />
    </div>
  );
}
