"use client";

import { useMemo, useState } from "react";
import { bracketPath, comboBracket, type Bracket, type BracketReport } from "@/lib/deck-beta/bracket";
import { planUpgrades, type Candidate, type Pick } from "@/lib/deck-beta/doctor";
import { looseCards } from "@/lib/deck-beta/playstyle";
import { cardKey } from "@/lib/deck-beta/recommend";
import {
  deckProfile,
  quadrantGaps,
  QUADRANT_INFO,
  QUADRANT_TARGETS,
  QUADRANTS,
  ROLE_INFO,
  ROLE_TARGETS,
  roleGaps,
  type DeckProfile,
  type Quadrant,
  type Role,
} from "@/lib/deck-beta/roles";
import { requestPlaystyle, usePlaystyle, useTargetBracket } from "@/lib/deck-beta/store";
import { parseTypeLine, type DeckAnalysis } from "@/lib/deck-beta/synergy";
import { formatCount, formatPercent } from "@/lib/format";
import type { CardDetails, Combo, DeckCombos } from "@/lib/types";
import { useGameChangers } from "@/lib/use-game-changers";
import { useHoverPreview } from "../card-link";
import { GameChangerTag } from "../game-changer-tag";
import { ManaCost } from "../mana";
import { BracketSection } from "./bracket-panel";
import { CombosList, type DeckForOdds } from "./combos-panel";
import { LazyCardImage } from "./lazy-card-image";

export const QUADRANT_COLORS: Record<Quadrant, string> = {
  developing: "#10b981",
  behind: "#f43f5e",
  parity: "#f59e0b",
  ahead: "#0ea5e9",
};

/** Most Commander decks run 34–38 lands; the meter aims at the middle. */
const LAND_TARGET = 36;
/** One-card-away combos offered. */
const COMBOS_SHOWN = 5;

const isLand = (card: CardDetails) => parseTypeLine(card.typeLine).types.has("Land");

/**
 * Recommendations built from the deck as it is and the bracket it should be
 * in: its bracket and what it takes to reach the chosen one, where its cards
 * sit in Quadrant Theory, how many of each job it has (ramp, card draw,
 * removal...), upgrades from EDHREC's decks for the commander that fill the
 * gaps without going past the bracket (flexible cards first, stronger cards
 * ranked up for higher brackets), combos a card away, and the cards doing the least.
 */
export function RecommendationsPanel({
  commander,
  deckCards,
  profile,
  report,
  checking,
  analysis,
  colors,
  combos,
  odds,
  missing,
  inDeck,
  onAdd,
  onOpen,
  onWalk,
}: {
  commander?: CardDetails;
  /** Every card in the deck once, with its copies. */
  deckCards: { card: CardDetails; qty: number }[];
  profile: DeckProfile;
  report: BracketReport;
  /** Commander Spellbook hasn't answered yet. */
  checking: boolean;
  analysis: DeckAnalysis;
  colors: string[];
  /** undefined while loading; null when Commander Spellbook couldn't be reached. */
  combos: DeckCombos | null | undefined;
  odds: DeckForOdds;
  missing: Record<string, CardDetails>;
  inDeck: (name: string) => boolean;
  onAdd: (card: CardDetails) => void;
  onOpen: (name: string) => void;
  onWalk: (combo: Combo) => void;
}) {
  const state = usePlaystyle(commander, "");
  const gameChangers = useGameChangers();
  const [chosen, setChosen] = useTargetBracket();
  const target = (chosen || report.bracket) as Bracket;
  const path = bracketPath(report, target, commander?.name);
  const found = state?.state === "done" && state.result.found ? state.result : null;

  // Cards added from these picks stay listed (as "In deck"), so the plan is made
  // from the deck without them and only changes when the rest of the deck does.
  const [addedHere, setAddedHere] = useState<string[]>([]);
  const add = (card: CardDetails) => {
    setAddedHere((names) => [...names, cardKey(card.name)]);
    onAdd(card);
  };
  const base = deckCards.filter((c) => !addedHere.includes(cardKey(c.card.name)));
  const baseKey = base.map((c) => `${c.card.name}×${c.qty}`).join("\n");
  const plan = useMemo(() => {
    if (!found) return null;
    const baseProfile = deckProfile(base, colors);
    const names = new Set(base.map((c) => cardKey(c.card.name)));
    const candidates: Candidate[] = found.cards.flatMap((c) =>
      found.details[c.name] ? [{ card: found.details[c.name], synergy: c.synergy, inclusion: c.inclusion }] : [],
    );
    // Game Changers in the commander's colors that EDHREC's list didn't include, for higher brackets.
    const identity = new Set(commander?.colorIdentity ?? colors);
    const listed = new Set(candidates.map((c) => cardKey(c.card.name)));
    for (const card of gameChangers.cards) {
      if (!listed.has(cardKey(card.name)) && card.colorIdentity.every((c) => identity.has(c))) candidates.push({ card });
    }
    // Cards that would complete a combo, by the bracket of the strongest one.
    const completes = new Map<string, Bracket>();
    for (const combo of combos?.almostIncluded ?? []) {
      const level = comboBracket(combo);
      for (const piece of combo.cards.filter((n) => !names.has(cardKey(n)))) {
        completes.set(cardKey(piece), Math.max(level, completes.get(cardKey(piece)) ?? 1) as Bracket);
      }
    }
    return planUpgrades(baseProfile, roleGaps(baseProfile), quadrantGaps(baseProfile), candidates, (n) => names.has(cardKey(n)), {
      bracket: target,
      isGameChanger: gameChangers.has,
      gameChangersInDeck: base.filter((c) => gameChangers.has(c.card.name)).length,
      completes: (n) => completes.get(cardKey(n)),
    });
    // The base key captures the deck the plan is made from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, baseKey, colors, target, gameChangers, combos, commander]);

  const cuts = useMemo(() => {
    const loose = new Set(looseCards(analysis));
    const listed = found ? new Set(found.listed.map(cardKey)) : undefined;
    const noJob = new Set(profile.noQuadrant);
    return deckCards
      .filter(({ card }) => card.name !== commander?.name && !isLand(card))
      .map(({ card }) => {
        const reasons: string[] = [];
        if (noJob.has(card.name)) reasons.push("fits no quadrant");
        if (loose.has(card.name)) reasons.push("links to nothing in your deck");
        if (listed && !listed.has(cardKey(card.name))) reasons.push(`rare in ${commander?.name ?? "these"} decks`);
        return { name: card.name, reasons };
      })
      .filter((c) => c.reasons.length >= 2)
      .sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));
  }, [analysis, found, profile, deckCards, commander]);

  // One-card-away combos the chosen bracket allows.
  const comboLimit = target <= 2 ? 2 : target === 3 ? 3 : 5;
  const addable = combos?.almostIncluded.filter((c) => c.cards.some((n) => missing[n])) ?? [];
  const almost = addable.filter((c) => comboBracket(c) <= comboLimit).slice(0, COMBOS_SHOWN);
  const tooStrong = addable.filter((c) => comboBracket(c) > comboLimit).length;

  return (
    <div className="flex flex-col gap-8">
      <BracketSection report={report} checking={checking} target={target} onTarget={(b) => setChosen(b === report.bracket ? 0 : b)} path={path} onOpen={onOpen} />

      <section>
        <h3 className="font-semibold">Quadrant Theory</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Every card is good at some stage of a game: while everyone builds up, when you’re behind, when the board is
          stuck, or when you’re ahead. The more quadrants a card fits, the better it is; Sol Ring fits only Developing
          and is still worth playing for how strong it is there. Read from each card’s rules text, so it’s a guide: the
          same card can sit in a different quadrant in a different deck.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {QUADRANTS.map((q) => (
            <QuadrantTile key={q} quadrant={q} profile={profile} onOpen={onOpen} />
          ))}
        </ul>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="font-semibold">What your deck has</h3>
          <p className="mb-3 text-xs text-zinc-500">
            Each job against a rough guide for a 100-card deck. Open a row for the cards doing it.
          </p>
          <JobMeters profile={profile} onOpen={onOpen} />
        </section>
        <section>
          <h3 className="font-semibold">Your most flexible cards</h3>
          <p className="mb-3 text-xs text-zinc-500">Cards that fit two or more quadrants: good in more games, keep these.</p>
          {profile.flexible.length === 0 ? (
            <p className="text-sm text-zinc-500">None yet. Cards that do two jobs (like a creature that ramps and draws) show here.</p>
          ) : (
            <CardChips names={[...profile.flexible].sort((a, b) => quadrantsFor(profile, b).length - quadrantsFor(profile, a).length || a.localeCompare(b))} profile={profile} onOpen={onOpen} />
          )}
        </section>
      </div>

      <section className="flex flex-col gap-5">
        <div>
          <h3 className="font-semibold">Upgrades for Bracket {target}</h3>
          <p className="text-xs text-zinc-500">
            Cards from EDHREC’s {commander?.name ?? "commander’s"} decks that fill what your deck is short on, most
            played and highest synergy first, with cards that fit more quadrants ranked up
            {target >= 4 ? " and stronger cards (Game Changers, tutors, fast mana, free spells) ranked higher still" : ""}.
            Nothing here would take the deck past Bracket {target}.
            {found && (
              <>
                {" "}
                <a href={found.url} target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline dark:text-amber-400">
                  View on EDHREC ↗
                </a>
              </>
            )}
          </p>
        </div>
        {!commander ? (
          <p className="text-sm text-zinc-500">Pick a commander to see upgrades.</p>
        ) : !state || state.state === "loading" || state.state === "waiting" ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500" />
            {state?.state === "waiting" ? `Waiting ${state.seconds}s because ${state.reason}, then trying again…` : "Loading EDHREC’s decks for your commander…"}
          </p>
        ) : state.state === "error" ? (
          <p className="text-sm text-zinc-500">
            Couldn’t reach EDHREC after several tries.{" "}
            <button type="button" onClick={() => requestPlaystyle(commander, "", true)} className="text-amber-700 underline dark:text-amber-400">
              Try again
            </button>
          </p>
        ) : !found || !plan ? (
          <p className="text-sm text-zinc-500">EDHREC has no page for {commander.name}.</p>
        ) : (
          <>
            <UpgradeGroup
              title="Flexible picks"
              note="Cards that fit two or more quadrants, most first: they're good in more of your games, so they make the best upgrades."
              picks={plan.flexible}
              inDeck={inDeck}
              onAdd={add}
            />
            <UpgradeGroup
              title="Consistency: card draw and tutors"
              note={`You have ${formatCount(profile.roles.draw.length)} card draw and ${formatCount(profile.roles.tutor.length)} tutors. Drawing more and finding the card you need make every game play more like your best one, and tutors find combo pieces.`}
              picks={plan.consistency}
              inDeck={inDeck}
              onAdd={add}
            />
            <UpgradeGroup
              title="Ramp"
              note={`You have ${formatCount(profile.roles.ramp.length)}; most decks want about ${ROLE_TARGETS.ramp}. Getting ahead on mana is the strongest Developing play.`}
              picks={plan.ramp}
              inDeck={inDeck}
              onAdd={add}
            />
            {plan.quadrants.map((g) => (
              <UpgradeGroup
                key={g.quadrant}
                title={`${QUADRANT_INFO[g.quadrant].label}: ${formatCount(g.short)} short`}
                quadrant={g.quadrant}
                note={`${QUADRANT_INFO[g.quadrant].question} ${QUADRANT_INFO[g.quadrant].examples}. Cards that also fit other quadrants come first.`}
                picks={g.picks}
                inDeck={inDeck}
                onAdd={add}
              />
            ))}
            <UpgradeGroup
              title={target >= 4 ? "Stronger cards" : `Game Changers you have room for (${formatCount(path.gameChangerRoom)} of 3 left)`}
              note={
                target >= 4
                  ? `Game Changers and the cards that make Bracket ${target} decks fast: tutors, fast mana and free spells.`
                  : "Bracket 3 allows up to 3 Game Changers: these are the best fits for your deck."
              }
              picks={plan.power}
              inDeck={inDeck}
              onAdd={add}
            />
            {plan.leftOut.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Left out for Bracket {target} ({formatCount(plan.leftOut.length)})
                </summary>
                <p className="mt-1 mb-2 text-xs text-zinc-500">Good fits for your deck that would take it past Bracket {target}.</p>
                <ul className="flex flex-col gap-1.5">
                  {plan.leftOut.map(({ pick, why }) => (
                    <li key={pick.card.name} className="flex flex-wrap items-center gap-2">
                      <CutName name={pick.card.name} onOpen={onOpen} />
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{why}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <section>
        <h3 className="font-semibold">Complete a combo</h3>
        <p className="mb-2 text-xs text-zinc-500">
          Combos you could have with one more card that fit Bracket {target}, most played first.
          {tooStrong > 0 && ` ${formatCount(tooStrong)} more ${tooStrong === 1 ? "is" : "are"} hidden for being above Bracket ${target}.`}
        </p>
        {combos === undefined ? (
          <p className="text-sm text-zinc-500">{commander ? "Loading combos…" : "Pick a commander to see combos."}</p>
        ) : combos === null ? (
          <p className="text-sm text-zinc-500">Couldn’t reach Commander Spellbook. Use “Try again” beside the commander.</p>
        ) : almost.length === 0 ? (
          <p className="text-sm text-zinc-500">No combo in Bracket {target} is one card away.</p>
        ) : (
          <CombosList combos={almost} deck={odds} missing={missing} inDeck={inDeck} onAdd={onAdd} onOpen={onOpen} onWalk={onWalk} />
        )}
      </section>

      <section>
        <h3 className="font-semibold">Cards to look at cutting</h3>
        <p className="mb-2 text-xs text-zinc-500">
          Cards with two or more of these marks: they fit no quadrant, they link to nothing else in your deck, or EDHREC’s
          decks for this commander rarely play them. Lands and your commander aren’t counted.
        </p>
        {cuts.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing stands out: every card does a job or works with your deck.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {cuts.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center gap-2 text-sm">
                <CutName name={c.name} onOpen={onOpen} />
                {c.reasons.map((r) => (
                  <span key={r} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {r}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function quadrantsFor(profile: DeckProfile, name: string): Quadrant[] {
  return QUADRANTS.filter((q) => profile.quadrants[q].includes(name));
}

function QuadrantTile({ quadrant, profile, onOpen }: { quadrant: Quadrant; profile: DeckProfile; onOpen: (name: string) => void }) {
  const info = QUADRANT_INFO[quadrant];
  const names = profile.quadrants[quadrant];
  const target = QUADRANT_TARGETS[quadrant];
  const color = QUADRANT_COLORS[quadrant];
  // Flexible cards first.
  const sorted = [...names].sort((a, b) => quadrantsFor(profile, b).length - quadrantsFor(profile, a).length || a.localeCompare(b));
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" style={{ borderTopColor: color, borderTopWidth: 3 }}>
      <div className="flex items-baseline gap-2">
        <p className="font-semibold" style={{ color }}>
          {info.label}
        </p>
        <p className="ml-auto text-sm tabular-nums">
          <span className="font-semibold">{formatCount(names.length)}</span>
          <span className="text-zinc-500"> / ~{target}</span>
        </p>
      </div>
      <p className="text-xs text-zinc-500">
        {info.question} {info.examples}.
      </p>
      <Bar have={names.length} target={target} color={color} />
      {sorted.length > 0 ? (
        <div className="max-h-36 overflow-y-auto pr-1">
          <CardChips names={sorted} profile={profile} onOpen={onOpen} />
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No cards here yet.</p>
      )}
    </li>
  );
}

function Bar({ have, target, color }: { have: number; target: number; color: string }) {
  return (
    <span className="relative block h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (have / target) * 100)}%`, background: color }} />
    </span>
  );
}

/** Card names that open the card, with a dot for each quadrant it fits. */
function CardChips({ names, profile, onOpen }: { names: string[]; profile: DeckProfile; onOpen: (name: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <CardChip key={name} name={name} quadrants={quadrantsFor(profile, name)} onOpen={onOpen} />
      ))}
    </div>
  );
}

function CardChip({ name, quadrants, onOpen }: { name: string; quadrants: Quadrant[]; onOpen: (name: string) => void }) {
  const { trigger, preview } = useHoverPreview(name);
  return (
    <>
      <button
        type="button"
        {...trigger}
        onClick={() => {
          trigger.onClick();
          onOpen(name);
        }}
        title={quadrants.map((q) => QUADRANT_INFO[q].label).join(", ")}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs hover:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {name}
        <GameChangerTag name={name} compact />
        <span aria-hidden className="flex gap-0.5">
          {quadrants.map((q) => (
            <span key={q} className="size-1.5 rounded-full" style={{ background: QUADRANT_COLORS[q] }} />
          ))}
        </span>
      </button>
      {preview}
    </>
  );
}

function CutName({ name, onOpen }: { name: string; onOpen: (name: string) => void }) {
  const { trigger, preview } = useHoverPreview(name);
  return (
    <>
      <button
        type="button"
        {...trigger}
        onClick={() => {
          trigger.onClick();
          onOpen(name);
        }}
        className="font-medium hover:text-amber-700 hover:underline dark:hover:text-amber-400"
      >
        {name}
      </button>
      <GameChangerTag name={name} />
      {preview}
    </>
  );
}

interface Meter {
  label: string;
  have: number;
  target?: number;
  names: string[];
  quadrant?: Quadrant;
}

function JobMeters({ profile, onOpen }: { profile: DeckProfile; onOpen: (name: string) => void }) {
  const role = (r: Role, label = ROLE_INFO[r].label): Meter => ({
    label,
    have: profile.roles[r].length,
    target: ROLE_TARGETS[r],
    names: profile.roles[r],
    quadrant: ROLE_INFO[r].quadrant,
  });
  const meters: Meter[] = [
    { label: "Lands", have: profile.lands, target: LAND_TARGET, names: [] },
    role("ramp"),
    role("draw"),
    role("tutor", "Tutors"),
    role("removal"),
    {
      label: "Board wipes",
      have: profile.wipes,
      target: ROLE_TARGETS.wipe,
      names: [...profile.roles.wipe, ...profile.roles.onesidedwipe].sort(),
      quadrant: "behind",
    },
    role("protection"),
    ...(profile.blue ? [{ ...role("counter", "Counterspells"), target: 2 }] : []),
    role("finisher", "Finishers"),
  ];
  return (
    <ul className="flex flex-col gap-1">
      {meters.map((m) => {
        const short = m.target !== undefined && m.have < m.target;
        const row = (
          <span className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-sm">
            <span className="truncate text-zinc-700 dark:text-zinc-300">{m.label}</span>
            {m.target !== undefined ? (
              <Bar have={m.have} target={m.target} color={short ? "#f59e0b" : "#10b981"} />
            ) : (
              <span className="text-xs text-zinc-500">no set number</span>
            )}
            <span className="text-right tabular-nums">
              <span className="font-semibold">{formatCount(m.have)}</span>
              {m.target !== undefined && <span className="text-zinc-500"> / {m.target}</span>}
            </span>
          </span>
        );
        return (
          <li key={m.label}>
            {m.names.length === 0 ? (
              <div className="py-1 pl-4">{row}</div>
            ) : (
              <details className="group">
                <summary className="cursor-pointer list-none rounded-md py-1 pl-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
                  <span className="relative block">
                    <span aria-hidden className="absolute top-1/2 -left-3.5 -translate-y-1/2 text-[10px] text-zinc-400 transition-transform group-open:rotate-90">
                      ▶
                    </span>
                    {row}
                  </span>
                </summary>
                <div className="flex flex-wrap gap-1.5 pt-1 pb-2 pl-4">
                  {m.names.map((name) => (
                    <CardChip key={name} name={name} quadrants={m.quadrant ? [m.quadrant] : []} onOpen={onOpen} />
                  ))}
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function UpgradeGroup({
  title,
  note,
  quadrant,
  picks,
  inDeck,
  onAdd,
}: {
  title: string;
  note: string;
  quadrant?: Quadrant;
  picks: Pick[];
  inDeck: (name: string) => boolean;
  onAdd: (card: CardDetails) => void;
}) {
  if (picks.length === 0) return null;
  return (
    <div>
      <h4 className="flex items-center gap-2 font-medium">
        {quadrant && <span aria-hidden className="size-2.5 rounded-full" style={{ background: QUADRANT_COLORS[quadrant] }} />}
        {title}
      </h4>
      <p className="mb-2 text-xs text-zinc-500">{note}</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p) => (
          <UpgradeRow key={p.card.name} pick={p} added={inDeck(p.card.name)} onAdd={onAdd} />
        ))}
      </ul>
    </div>
  );
}

function UpgradeRow({ pick, added, onAdd }: { pick: Pick; added: boolean; onAdd: (card: CardDetails) => void }) {
  const { card } = pick;
  const { trigger, preview } = useHoverPreview(card.name);
  return (
    <li className="flex gap-2.5 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div {...trigger} className="aspect-[488/680] w-12 shrink-0 overflow-hidden rounded-[4.75%] bg-zinc-200 dark:bg-zinc-800">
        <LazyCardImage url={card.imageUrl} alt={card.name} />
      </div>
      {preview}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-1.5">
          <p {...trigger} className="min-w-0 flex-1 text-sm leading-tight font-medium">
            {card.name}
            <GameChangerTag name={card.name} className="ml-1.5" />
          </p>
          {card.manaCost && <ManaCost cost={card.manaCost.split(" // ")[0]} />}
        </div>
        <p className="flex flex-wrap gap-1">
          {pick.completes && pick.completes >= 3 && (
            <span className="rounded-full bg-violet-100 px-1.5 text-[11px] leading-4 text-violet-900 dark:bg-violet-950 dark:text-violet-300">
              Completes a Bracket {pick.completes} combo
            </span>
          )}
          {pick.extraTurn && (
            <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] leading-4 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Extra turn</span>
          )}
          {pick.roles.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-1.5 text-[11px] leading-4 dark:border-zinc-700"
            >
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: QUADRANT_COLORS[ROLE_INFO[r].quadrant] }} />
              {ROLE_INFO[r].label}
            </span>
          ))}
        </p>
        <p className="text-xs text-zinc-500 tabular-nums">
          {pick.inclusion !== undefined && <>in {formatPercent(pick.inclusion)} of decks</>}
          {pick.synergy !== undefined && pick.synergy > 0 && <span className="text-emerald-600"> · +{formatPercent(pick.synergy)} synergy</span>}
        </p>
      </div>
      <button
        type="button"
        disabled={added}
        onClick={() => onAdd(card)}
        aria-label={added ? `${card.name} is in your deck` : `Add ${card.name} to deck`}
        className={`h-8 shrink-0 self-center rounded-lg px-2.5 text-xs font-medium ${
          added ? "border border-emerald-600 text-emerald-700 dark:text-emerald-400" : "bg-amber-500 text-zinc-950 hover:bg-amber-400"
        }`}
      >
        {added ? "In deck ✓" : "+ Add"}
      </button>
    </li>
  );
}
