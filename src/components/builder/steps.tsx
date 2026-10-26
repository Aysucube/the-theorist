"use client";

import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import { AppLink as Link } from "@/components/app-link";
import { useEffect, useId, useMemo, useState } from "react";
import type { BuilderResponse } from "@/lib/deck-beta/api";
import { BRACKET_INFO, BRACKETS, type Bracket } from "@/lib/deck-beta/bracket";
import { MAX_LANDS, MIN_LANDS, splitBasics } from "@/lib/builder/plan";
import type { DraftCommander } from "@/lib/builder/draft";
import type { CacheStatus } from "@/lib/binder/card-cache";
import { useCardDetails } from "@/lib/binder/card-cache";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { CardDetails } from "@/lib/types";
import { formatCount, formatPercent } from "@/lib/format";
import type { GamePlan } from "@/lib/deck-beta/game-plan";
import type { ManaBasePlan } from "@/lib/deck-beta/lands";
import { LazyCardImage } from "../deck-beta/lazy-card-image";
import { GamePlanCard } from "../deck-beta/template-bits";
import { GameChangerTag } from "../game-changer-tag";
import { ColorIdentity, Pip } from "../mana";
import { Meter } from "./deck-rail";

type Found = Extract<BuilderResponse, { found: true }>;

const COLOR_FILTERS = ["W", "U", "B", "R", "G", "C"] as const;
type ColorMode = "includes" | "exactly" | "within";
const MODES: { id: ColorMode; label: string }[] = [
  { id: "includes", label: "Including" },
  { id: "exactly", label: "Exactly" },
  { id: "within", label: "Within" },
];

export function toDraftCommander(card: CardDetails): DraftCommander {
  return { name: card.name, layout: card.layout, colorIdentity: card.colorIdentity, imageUrl: card.imageUrl, cmc: card.cmc };
}

function matchesColors(identity: string[], picked: string[], mode: ColorMode) {
  if (picked.length === 0) return true;
  const colorless = picked.includes("C");
  const colors = picked.filter((c) => c !== "C");
  if (colorless && colors.length === 0) return identity.length === 0;
  if (mode === "includes") return colors.every((c) => identity.includes(c));
  if (mode === "exactly") return identity.length === colors.length && colors.every((c) => identity.includes(c));
  return identity.every((c) => colors.includes(c));
}

/** 1. Pick a commander from the binder, filtered by color, or any commander by name. */
export function CommanderStep({
  commanders,
  binderSize,
  status,
  owned,
  selected,
  onChoose,
}: {
  /** Commanders in the binder, with details. */
  commanders: CardDetails[];
  binderSize: number;
  status: CacheStatus;
  owned: (name: string) => number;
  selected?: string;
  onChoose: (commander: DraftCommander) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<ColorMode>("includes");
  const [query, setQuery] = useState("");
  const shown = commanders
    .filter((c) => matchesColors(c.colorIdentity, picked, mode) && c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {COLOR_FILTERS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={picked.includes(c)}
              onClick={() => setPicked(picked.includes(c) ? picked.filter((p) => p !== c) : [...picked, c])}
              className="pill"
              aria-label={c === "C" ? "Colorless" : `Color ${c}`}
            >
              {c === "C" ? <span className="text-xs">Colorless</span> : <Pip symbol={c} className="size-[18px] text-[10px]" />}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <div role="radiogroup" aria-label="How colors match" className="flex gap-1">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className="pill">
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter your commanders by name"
          aria-label="Filter commanders by name"
          className="field h-10 max-w-sm"
        />
      </div>

      {binderSize === 0 ? (
        <p className="max-w-lg text-sm text-muted">
          Your binder is empty, so there are no commanders of yours to show.{" "}
          <Link href="/binder" className="link text-foreground">
            Add your collection
          </Link>{" "}
          first, or pick any commander below; cards you don’t own will be grayed out.
        </p>
      ) : status.state !== "idle" && commanders.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="spinner size-4" />
          Reading your binder ({formatCount(status.pending)} cards left)…
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">No commander in your binder matches.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((card, i) => (
            <motion.li
              key={card.name}
              initial={{ opacity: 0, transform: "translateY(8px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: Math.min(i, 12) * 0.03 }}
            >
              <button
                type="button"
                onClick={() => onChoose(toDraftCommander(card))}
                aria-pressed={selected === card.name}
                className="group block w-full text-left"
              >
                <span
                  className={`block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle ring-offset-4 ring-offset-background transition-shadow duration-200 ${
                    selected === card.name ? "ring-2 ring-accent" : ""
                  }`}
                >
                  <LazyCardImage url={card.imageUrl} alt={card.name} />
                </span>
                <span className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{card.name}</span>
                  <ColorIdentity colors={card.colorIdentity} compact />
                </span>
                {owned(card.name) > 1 && <span className="text-[11px] text-muted">×{owned(card.name)} in your binder</span>}
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      <AnyCommander selected={selected} onChoose={onChoose} />
    </div>
  );
}

/** Any commander by name, for one the binder doesn't have. */
function AnyCommander({ selected, onChoose }: { selected?: string; onChoose: (commander: DraftCommander) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const { detailsFor } = useCardDetails(pending ? [pending] : []);
  const details = pending ? detailsFor(pending) : undefined;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void fetchJsonWithRetry<{ names?: string[] }>(`/api/autocomplete?q=${encodeURIComponent(q)}`, { busyReason: "Scryfall is busy" }).then((r) => {
        if (r !== "error") setSuggestions((r.names ?? []).slice(0, 6));
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (details && details.canBeCommander && details.name !== selected) onChoose(toDraftCommander(details));
    // Choose once the details for the picked name arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);

  return (
    <div className="border-t border-line pt-6">
      <label htmlFor={id} className="text-sm font-medium">
        Or any commander
      </label>
      <p className="mt-0.5 text-xs text-muted">Build around one you don’t own yet. Its card will be grayed out like the rest.</p>
      <input
        id={id}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a commander"
        className="field mt-3 h-10 max-w-sm"
      />
      {query.trim().length >= 2 && suggestions.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((name) => (
            <li key={name}>
              <button type="button" onClick={() => setPending(name)} aria-pressed={pending === name} className="pill">
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending && details === null && <p className="mt-2 text-xs text-muted">Scryfall doesn’t know that card.</p>}
      {pending && details && !details.canBeCommander && <p className="mt-2 text-xs text-muted">{details.name} can’t be a commander.</p>}
      {pending && details === undefined && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span aria-hidden className="spinner size-3" /> Looking it up…
        </p>
      )}
    </div>
  );
}

/** 2. Pick the bracket, with how this commander's decks split across them on EDHREC. */
export function BracketStep({
  commander,
  counts,
  selected,
  onChoose,
}: {
  commander: string;
  counts?: Record<string, number>;
  selected?: Bracket;
  onChoose: (bracket: Bracket) => void;
}) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const most = counts && total > 0 ? (Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as Bracket) : undefined;
  return (
    <div className="flex flex-col gap-6">
      {most && (
        <p className="text-sm text-muted">
          Most {commander} decks on EDHREC are Bracket {most} ({formatPercent((counts![String(most)] ?? 0) / total)}).
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BRACKETS.map((b, i) => {
          const share = counts && total > 0 ? (counts[String(b)] ?? 0) / total : undefined;
          return (
            <motion.li
              key={b}
              initial={{ opacity: 0, transform: "translateY(8px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: i * 0.04 }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected === b}
                onClick={() => onChoose(b)}
                className={`flex h-full w-full flex-col gap-3 rounded-2xl border p-5 text-left transition-colors duration-150 ${
                  selected === b ? "border-accent bg-accent text-on-accent shadow-[0_0_16px_-4px_rgb(90_176_255/0.6)]" : "border-line hover:border-line-strong"
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold tracking-tight">Bracket {b}</span>
                  <span className={`text-sm ${selected === b ? "text-on-accent/70" : "text-muted"}`}>{BRACKET_INFO[b].name}</span>
                </span>
                <span className={`text-[13px] leading-relaxed ${selected === b ? "text-on-accent/80" : "text-muted"}`}>{BRACKET_INFO[b].rules}</span>
                {share !== undefined && (
                  <span className="mt-auto flex items-center gap-2 text-[11px] tabular-nums">
                    <span className={`block h-1 flex-1 overflow-hidden rounded-full ${selected === b ? "bg-background/20" : "bg-subtle"}`}>
                      <span
                        className={`block h-full origin-left rounded-full ${selected === b ? "bg-on-accent/70" : "bg-accent/60"}`}
                        style={{ transform: `scaleX(${share})` }}
                      />
                    </span>
                    {formatPercent(share)} of decks
                  </span>
                )}
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** 3. What EDHREC knows: how many decks, the cards that suit the commander best (new ones too), and its playstyles. */
export function SynergyStep({
  commander,
  data,
  loading,
  failed,
  onRetry,
  owned,
  theme,
  onTheme,
  preferOwned,
  onPreferOwned,
  plan,
}: {
  commander: DraftCommander;
  data: Found | null;
  loading: string | null;
  failed: boolean;
  onRetry: () => void;
  owned: (name: string) => number;
  theme: string;
  onTheme: (slug: string, name?: string) => void;
  preferOwned: boolean;
  onPreferOwned: (value: boolean) => void;
  /** The commander's game plan, once its card and EDHREC's data are in. */
  plan?: GamePlan;
}) {
  const ranked = useMemo(() => {
    if (!data) return null;
    const detailed = data.cards.filter((c) => data.details[c.name] && !/\bBasic\b/.test(data.details[c.name].typeLine));
    const newCards = detailed.filter((c) => c.lists.some((l) => /new/i.test(l)));
    const synergy = [...detailed].sort((a, b) => (b.synergy ?? -1) - (a.synergy ?? -1)).slice(0, 12);
    const ownedCount = data.cards.filter((c) => owned(c.name) > 0).length;
    return { newCards, synergy, ownedCount };
    // Ownership changes only with the binder, which can't change on this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (failed) {
    return (
      <p className="text-sm text-muted">
        Couldn’t reach EDHREC after several tries.{" "}
        <button type="button" onClick={onRetry} className="link text-foreground">
          Try again
        </button>
      </p>
    );
  }
  if (!data || !ranked) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-muted">
        <span aria-hidden className="spinner size-5" />
        {loading ?? `Reading EDHREC’s decks for ${commander.name}…`}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {plan && <GamePlanCard plan={plan} articles={data.articles} edhrecUrl={data.url} />}
      <dl className="grid grid-cols-3 gap-6 border-y border-line py-6">
        <Stat label="Decks on EDHREC" value={data.numDecks} />
        <Stat label="Cards they play" value={data.cards.length} />
        <Stat label="Of those, in your binder" value={ranked.ownedCount} />
      </dl>

      {ranked.newCards.length > 0 && (
        <CardRow title="New cards" note="Recently printed cards EDHREC is seeing in these decks." cards={ranked.newCards.map((c) => data.details[c.name])} owned={owned} />
      )}
      <CardRow
        title="Highest synergy"
        note={`The cards that suit ${commander.name} best, compared with other decks of its colors.`}
        cards={ranked.synergy.map((c) => data.details[c.name])}
        owned={owned}
      />

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="font-semibold">Playstyle</h3>
          <p className="text-sm text-muted">How EDHREC players build {commander.name}. Pick one to lean into, or stay balanced.</p>
        </div>
        <div role="radiogroup" aria-label="Playstyle" className="flex flex-wrap gap-2">
          <button type="button" role="radio" aria-checked={theme === ""} onClick={() => onTheme("")} className="pill">
            Balanced
          </button>
          {data.themes.slice(0, 14).map((t) => (
            <button key={t.slug} type="button" role="radio" aria-checked={theme === t.slug} onClick={() => onTheme(t.slug, t.name)} className="pill">
              {t.name}
              <span className="text-[11px] tabular-nums opacity-60">{formatCount(t.numDecks)}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={preferOwned} onChange={(e) => onPreferOwned(e.target.checked)} className="size-4 accent-foreground" />
        Put cards from my binder first
      </label>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        <NumberFlow value={value} />
      </dd>
    </div>
  );
}

function CardRow({ title, note, cards, owned }: { title: string; note: string; cards: CardDetails[]; owned: (name: string) => number }) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-3 text-sm text-muted">{note}</p>
      <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {cards.map((card, i) => (
          <motion.li
            key={card.name}
            initial={{ opacity: 0, transform: "translateY(8px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: Math.min(i, 10) * 0.03 }}
            className="w-28 shrink-0 snap-start"
          >
            <span className="relative block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle">
              <span className={`block h-full ${owned(card.name) > 0 ? "" : "opacity-55 grayscale"}`}>
                <LazyCardImage url={card.imageUrl} alt={card.name} />
              </span>
              <GameChangerTag name={card.name} compact className="absolute top-1 left-1" />
            </span>
            <span className="mt-1.5 block truncate text-[12px] font-medium">{card.name}</span>
            <span className="block text-[11px] text-muted">{owned(card.name) > 0 ? "In your binder" : "Not owned"}</span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/** 4. How many lands, starting from a recommendation, and how the basics will split. */
export function LandsStep({
  recommended,
  why,
  lands,
  onLands,
  colors,
  nonbasicLands,
  manaCosts,
  manaBase,
}: {
  recommended: number;
  why: string;
  lands: number;
  onLands: (n: number) => void;
  colors: string[];
  nonbasicLands: number;
  manaCosts: string[];
  /** How the commander's colors shape the lands. */
  manaBase: ManaBasePlan;
}) {
  const id = useId();
  const basics = Math.max(0, lands - nonbasicLands);
  const split = splitBasics(basics, colors, manaCosts);
  const spells = 99 - lands;
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <p className="text-sm text-muted">Recommended</p>
        <p className="text-5xl font-semibold tracking-tight tabular-nums">
          <NumberFlow value={lands} />
          <span className="ml-2 text-base font-normal text-muted">lands</span>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{why}</p>
        {lands !== recommended && (
          <button type="button" onClick={() => onLands(recommended)} className="btn btn-ghost btn-sm -ml-3 mt-1 text-muted">
            Back to {recommended}
          </button>
        )}
      </div>
      <div>
        <label htmlFor={id} className="sr-only">
          Lands
        </label>
        <input
          id={id}
          type="range"
          min={MIN_LANDS}
          max={MAX_LANDS}
          value={lands}
          onChange={(e) => onLands(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums">
          <span>{MIN_LANDS}</span>
          <span>{MAX_LANDS}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <p className="eyebrow">Your mana base</p>
        <p className="text-sm">{manaBase.advice}</p>
        <p className="text-sm text-muted tabular-nums">
          About {manaBase.basics} basics and {manaBase.nonbasics} other lands: {colors.length >= 2 ? "untapped duals, fetches and fixing" : "utility lands"}
          {manaBase.utilityRoom > 0 && `, with room for ${manaBase.utilityRoom} utility ${manaBase.utilityRoom === 1 ? "land" : "lands"}`}. Avoid lands that
          always enter tapped: a basic is often better. Acceleration at 2 mana or less beats three-mana rocks.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <p className="eyebrow">Basics, by the colors your cards ask for</p>
        {Object.entries(split).map(([basic, n]) => (
          <div key={basic} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm">
            <span className="text-muted">{basic}</span>
            <Meter value={basics > 0 ? n / basics : 0} />
            <span className="text-right tabular-nums">{n}</span>
          </div>
        ))}
        <p className="text-xs text-muted">
          {nonbasicLands > 0 ? `${nonbasicLands} other ${nonbasicLands === 1 ? "land" : "lands"} chosen so far. ` : ""}
          Basics fill the rest and re-balance as you add spells. That leaves {spells} slots for spells.
        </p>
      </div>
      {colors.length === 0 && <p className="text-xs text-muted">Colorless decks use Wastes.</p>}
    </div>
  );
}
