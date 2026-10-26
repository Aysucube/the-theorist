"use client";

import { useMemo, useState } from "react";
import { bracketPath, comboBracket, isMassLandDenial, type Bracket, type BracketReport } from "@/lib/deck-beta/bracket";
import { curveCuts, planUpgrades, type Candidate, type Pick } from "@/lib/deck-beta/doctor";
import type { GamePlan } from "@/lib/deck-beta/game-plan";
import { isSlowRamp, LAND_KIND_LABEL, landFit, landKind, manaBase } from "@/lib/deck-beta/lands";
import { looseCards } from "@/lib/deck-beta/playstyle";
import { cardKey } from "@/lib/deck-beta/recommend";
import { CATEGORY_INFO, cardRoles, deckProfile, type DeckProfile } from "@/lib/deck-beta/roles";
import { requestPlaystyle, usePlaystyle, useTargetBracket } from "@/lib/deck-beta/store";
import type { DeckAnalysis } from "@/lib/deck-beta/synergy";
import type { EdhrecArticle } from "@/lib/sources/edhrec-articles";
import { formatCount, formatPercent } from "@/lib/format";
import type { CardDetails, Combo, DeckCombos } from "@/lib/types";
import { useGameChangers } from "@/lib/use-game-changers";
import { useHoverPreview } from "../card-link";
import { GameChangerTag } from "../game-changer-tag";
import { ManaCost } from "../mana";
import { BracketSection } from "./bracket-panel";
import { CombosList, type DeckForOdds } from "./combos-panel";
import { LazyCardImage } from "./lazy-card-image";
import { CardName, CurveChart, curveAdvice, FlexTag, GamePlanCard, TemplateMeters } from "./template-bits";

/** One-card-away combos offered. */
const COMBOS_SHOWN = 5;
/** Synergy at which an EDHREC card counts as part of the plan. */
const PLAN_SYNERGY = 0.15;

const isLand = (card: CardDetails) => /\bLand\b/.test(card.typeLine.split(" // ")[0]);

/**
 * A deck by the deckbuilding template: its commander's game plan, the
 * template's categories and the mana curve, the mana base for its colors, its
 * flexible cards, its bracket, then upgrades that secure the curve (cheap ramp
 * and card advantage) and fill what it's short of without going past the
 * chosen bracket, combos a card away, and what to cut for a lower curve.
 */
export function DeckOverview({
  commander,
  deckCards,
  profile,
  isPlan,
  report,
  checking,
  analysis,
  colors,
  combos,
  odds,
  missing,
  gamePlan,
  planInDeck,
  articles,
  edhrecUrl,
  planLoading,
  inDeck,
  onAdd,
  onOpen,
  onWalk,
}: {
  commander?: CardDetails;
  /** Every card in the deck once, with its copies. */
  deckCards: { card: CardDetails; qty: number }[];
  profile: DeckProfile;
  /** Whether a deck card is part of its plan (the playstyle and the commander's partners). */
  isPlan: (name: string) => boolean;
  report: BracketReport;
  /** Commander Spellbook hasn't answered yet. */
  checking: boolean;
  analysis: DeckAnalysis;
  colors: string[];
  /** undefined while loading; null when Commander Spellbook couldn't be reached. */
  combos: DeckCombos | null | undefined;
  odds: DeckForOdds;
  missing: Record<string, CardDetails>;
  gamePlan?: GamePlan;
  planInDeck?: { enablers: string[]; payoffs: string[] };
  articles?: EdhrecArticle[];
  edhrecUrl?: string;
  planLoading?: boolean;
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
  const upgrades = useMemo(() => {
    if (!found) return null;
    const baseProfile = deckProfile(base, { commander: commander?.name, isPlan });
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
    const plan = planUpgrades(baseProfile, candidates, (n) => names.has(cardKey(n)), {
      bracket: target,
      isGameChanger: gameChangers.has,
      gameChangersInDeck: base.filter((c) => gameChangers.has(c.card.name)).length,
      completes: (n) => completes.get(cardKey(n)),
      isPlan: (c) => (c.synergy ?? 0) >= PLAN_SYNERGY || isPlan(c.card.name),
    });
    // Lands for the deck's colors: untapped fixing in more colors, utility lands in fewer.
    const lands = candidates
      .filter((c) => isLand(c.card) && !names.has(cardKey(c.card.name)) && !/\bBasic\b/.test(c.card.typeLine) && !(target <= 3 && isMassLandDenial(c.card)))
      .map((c) => {
        const kind = landKind(c.card) ?? "other";
        return { card: c.card, kind, score: (c.inclusion ?? 0) + Math.max(0, c.synergy ?? 0) + landFit(kind, identity.size) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...plan, lands };
    // The base key captures the deck the plan is made from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, baseKey, colors, target, gameChangers, combos, commander, isPlan]);

  const cards = deckCards.map((c) => c.card);
  const cuts = useMemo(() => curveCuts(cards, profile, commander?.name), [cards, profile, commander]);
  const loose = useMemo(() => {
    const links = new Set(looseCards(analysis));
    return profile.unplaced.filter((name) => links.has(name) && name !== commander?.name);
  }, [analysis, profile, commander]);
  const mana = useMemo(() => manaBase(deckCards, colors.length, profile.curve.lands.count), [deckCards, colors, profile]);
  const slow = deckCards.filter(({ card }) => isSlowRamp(card, cardRoles(card))).map(({ card }) => card.name);

  // One-card-away combos the chosen bracket allows.
  const comboLimit = target <= 2 ? 2 : target === 3 ? 3 : 5;
  const addable = combos?.almostIncluded.filter((c) => c.cards.some((n) => missing[n])) ?? [];
  const almost = addable.filter((c) => comboBracket(c) <= comboLimit).slice(0, COMBOS_SHOWN);
  const tooStrong = addable.filter((c) => comboBracket(c) > comboLimit).length;

  return (
    <div className="flex flex-col gap-8">
      {gamePlan && <GamePlanCard plan={gamePlan} inDeck={planInDeck} articles={articles} edhrecUrl={edhrecUrl} loading={planLoading} />}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="font-semibold">The template</h3>
          <p className="mb-3 text-xs text-muted">
            A 100-card deck by The Command Zone’s template. The categories add up to more than 99 on purpose: the best cards fill two
            at once. Open a row for its cards. Read from rules text, so treat it as a guide.
          </p>
          <TemplateMeters profile={profile} onOpen={onOpen} />
        </section>
        <section>
          <h3 className="font-semibold">Mana curve</h3>
          <p className="mb-6 text-xs text-muted">Spells by mana value (dashes: a low, wide curve for a finished deck). {curveAdvice(profile.curve)}</p>
          <CurveChart curve={profile.curve} />
        </section>
      </div>

      <section>
        <h3 className="font-semibold">Mana base</h3>
        <p className="mb-3 text-xs text-muted">{mana.plan.advice}</p>
        <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Basics" have={mana.basics} aim={`about ${mana.plan.basics}`} />
          <Stat label="Nonbasic lands" have={mana.nonbasics} aim={`about ${mana.plan.nonbasics}`} />
          <Stat label="Utility lands" have={mana.utility} aim={`room for ${mana.plan.utilityRoom}`} warn={mana.utility > mana.plan.utilityRoom} />
          <Stat label="Enter tapped" have={mana.kinds.tapped?.length ?? 0} aim="as few as you can" warn={(mana.kinds.tapped?.length ?? 0) > 2} />
        </ul>
        {(mana.kinds.tapped?.length ?? 0) > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            Always enter tapped (a basic is often better):
            {mana.kinds.tapped!.map((n) => (
              <CardName key={n} name={n} onOpen={onOpen} />
            ))}
          </p>
        )}
        {slow.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            Three-mana rocks are slow now; two-mana acceleration does the job a turn sooner:
            {slow.map((n) => (
              <CardName key={n} name={n} onOpen={onOpen} />
            ))}
          </p>
        )}
      </section>

      <section>
        <h3 className="font-semibold">Your most flexible cards</h3>
        <p className="mb-3 text-xs text-muted">Cards that fill two or more template categories: they do double duty, so keep these.</p>
        {profile.flexible.length === 0 ? (
          <p className="text-sm text-muted">None yet. A creature that ramps and draws, or removal that wins the game, shows here.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {[...profile.flexible]
              .sort((a, b) => b.categories.length - a.categories.length || a.name.localeCompare(b.name))
              .map((f) => (
                <li key={f.name} className="flex items-center gap-1.5">
                  <CardName name={f.name} onOpen={onOpen} />
                  <FlexTag categories={f.categories} compact />
                </li>
              ))}
          </ul>
        )}
      </section>

      <BracketSection report={report} checking={checking} target={target} onTarget={(b) => setChosen(b === report.bracket ? 0 : b)} path={path} onOpen={onOpen} />

      <section className="flex flex-col gap-5">
        <div>
          <h3 className="font-semibold">Upgrades for Bracket {target}</h3>
          <p className="text-xs text-muted">
            Cards from EDHREC’s {commander?.name ?? "commander’s"} decks, the curve first: cheap ramp and card advantage, then what the
            template says you’re short of. Flexible cards and cheaper ones rank up
            {target >= 4 ? ", and stronger cards (Game Changers, tutors, fast mana) higher still" : ""}. Nothing here would take the deck past
            Bracket {target}.
            {found && (
              <>
                {" "}
                <a href={found.url} target="_blank" rel="noopener noreferrer" className="link">
                  View on EDHREC ↗
                </a>
              </>
            )}
          </p>
        </div>
        {!commander ? (
          <p className="text-sm text-muted">Pick a commander to see upgrades.</p>
        ) : !state || state.state === "loading" || state.state === "waiting" ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="size-4 spinner" />
            {state?.state === "waiting" ? `Waiting ${state.seconds}s because ${state.reason}, then trying again…` : "Loading EDHREC’s decks for your commander…"}
          </p>
        ) : state.state === "error" ? (
          <p className="text-sm text-muted">
            Couldn’t reach EDHREC after several tries.{" "}
            <button type="button" onClick={() => requestPlaystyle(commander, "", true)} className="link">
              Try again
            </button>
          </p>
        ) : !found || !upgrades ? (
          <p className="text-sm text-muted">EDHREC has no page for {commander.name}.</p>
        ) : (
          <>
            <UpgradeGroup
              title="Secure the curve"
              note={`Cheap ramp (2 mana or less) and card advantage (3 or less): they fill your early turns, let you cast two spells a turn, and keep the deck steady. ${curveAdvice(profile.curve)}`}
              picks={upgrades.curve}
              inDeck={inDeck}
              onAdd={add}
            />
            {upgrades.categories.map((g) => (
              <UpgradeGroup
                key={g.category}
                title={`${CATEGORY_INFO[g.category].label}: ${formatCount(g.short)} short`}
                note={`${CATEGORY_INFO[g.category].about} Flexible and cheaper cards first.`}
                picks={g.picks}
                inDeck={inDeck}
                onAdd={add}
              />
            ))}
            <UpgradeGroup
              title="Flexible picks"
              note="Cards that fill two or more categories, most first: one slot doing two jobs."
              picks={upgrades.flexible}
              inDeck={inDeck}
              onAdd={add}
            />
            <UpgradeGroup
              title={target >= 4 ? "Stronger cards" : `Game Changers you have room for (${formatCount(path.gameChangerRoom)} of 3 left)`}
              note={
                target >= 4
                  ? `Game Changers and the cards that make Bracket ${target} decks fast: tutors, fast mana and free spells.`
                  : "Bracket 3 allows up to 3 Game Changers: these are the best fits for your deck."
              }
              picks={upgrades.power}
              inDeck={inDeck}
              onAdd={add}
            />
            {upgrades.lands.length > 0 && (
              <div>
                <h4 className="font-medium">Lands for your colors</h4>
                <p className="mb-2 text-xs text-muted">{mana.plan.advice} Lands that always enter tapped rank down.</p>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {upgrades.lands.map((l) => (
                    <UpgradeRow key={l.card.name} card={l.card} note={LAND_KIND_LABEL[l.kind]} added={inDeck(l.card.name)} onAdd={add} />
                  ))}
                </ul>
              </div>
            )}
            {upgrades.leftOut.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Left out for Bracket {target} ({formatCount(upgrades.leftOut.length)})
                </summary>
                <p className="mt-1 mb-2 text-xs text-muted">Good fits for your deck that would take it past Bracket {target}.</p>
                <ul className="flex flex-col gap-1.5">
                  {upgrades.leftOut.map(({ pick, why }) => (
                    <li key={pick.card.name} className="flex flex-wrap items-center gap-2">
                      <CardName name={pick.card.name} onOpen={onOpen} />
                      <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">{why}</span>
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
        <p className="mb-2 text-xs text-muted">
          Combos you could have with one more card that fit Bracket {target}, most played first.
          {tooStrong > 0 && ` ${formatCount(tooStrong)} more ${tooStrong === 1 ? "is" : "are"} hidden for being above Bracket ${target}.`}
        </p>
        {combos === undefined ? (
          <p className="text-sm text-muted">{commander ? "Loading combos…" : "Pick a commander to see combos."}</p>
        ) : combos === null ? (
          <p className="text-sm text-muted">Couldn’t reach Commander Spellbook. Use “Try again” beside the commander.</p>
        ) : almost.length === 0 ? (
          <p className="text-sm text-muted">No combo in Bracket {target} is one card away.</p>
        ) : (
          <CombosList combos={almost} deck={odds} missing={missing} inDeck={inDeck} onAdd={onAdd} onOpen={onOpen} onWalk={onWalk} />
        )}
      </section>

      <section>
        <h3 className="font-semibold">Cuts for a lower curve</h3>
        <p className="mb-2 text-xs text-muted">
          Spells of 5 mana or more that fill no template category, most expensive first, then cards that do no job and link to nothing
          else in your deck. Cutting them for cheap ramp and card draw lowers the curve.
        </p>
        {cuts.length === 0 && loose.length === 0 ? (
          <p className="text-sm text-muted">Nothing stands out: every expensive card earns its slot.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {cuts.map((c) => (
              <li key={c.name} className="flex items-center gap-1.5">
                <CardName name={c.name} onOpen={onOpen} />
                <span className="text-xs text-muted tabular-nums">{c.cmc} mana</span>
              </li>
            ))}
            {loose
              .filter((n) => !cuts.some((c) => c.name === n))
              .map((n) => (
                <li key={n} className="flex items-center gap-1.5">
                  <CardName name={n} onOpen={onOpen} />
                  <span className="text-xs text-muted">no job, no links</span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, have, aim, warn = false }: { label: string; have: number; aim: string; warn?: boolean }) {
  return (
    <li className="rounded-lg border border-line bg-background px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular-nums">
        <span className={`text-lg font-semibold ${warn ? "text-amber-400" : ""}`}>{formatCount(have)}</span>{" "}
        <span className="text-xs text-muted">{aim}</span>
      </p>
    </li>
  );
}

function UpgradeGroup({ title, note, picks, inDeck, onAdd }: { title: string; note: string; picks: Pick[]; inDeck: (name: string) => boolean; onAdd: (card: CardDetails) => void }) {
  if (picks.length === 0) return null;
  return (
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="mb-2 text-xs text-muted">{note}</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p) => (
          <UpgradeRow key={p.card.name} card={p.card} pick={p} added={inDeck(p.card.name)} onAdd={onAdd} />
        ))}
      </ul>
    </div>
  );
}

/** An upgrade: the card, its flexibility tag (when it fills two or more categories), how often EDHREC's decks play it, and Add. */
function UpgradeRow({ card, pick, note, added, onAdd }: { card: CardDetails; pick?: Pick; note?: string; added: boolean; onAdd: (card: CardDetails) => void }) {
  const { trigger, preview } = useHoverPreview(card.name);
  return (
    <li className="flex gap-2.5 rounded-lg border border-line bg-background p-2">
      <div {...trigger} className="aspect-[488/680] w-12 shrink-0 overflow-hidden rounded-[4.75%] bg-subtle">
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
          {pick && <FlexTag categories={pick.categories} />}
          {note && <span className="rounded-full bg-subtle px-1.5 text-[11px] leading-4 text-muted">{note}</span>}
          {pick?.completes && pick.completes >= 3 && (
            <span className="rounded-full bg-subtle px-1.5 text-[11px] leading-4 text-muted">Completes a Bracket {pick.completes} combo</span>
          )}
          {pick?.extraTurn && <span className="rounded-full bg-subtle px-1.5 text-[11px] leading-4 text-foreground/80">Extra turn</span>}
        </p>
        {pick && (
          <p className="text-xs text-muted tabular-nums">
            {pick.inclusion !== undefined && <>in {formatPercent(pick.inclusion)} of decks</>}
            {pick.synergy !== undefined && pick.synergy > 0 && <span className="text-emerald-400"> · +{formatPercent(pick.synergy)} synergy</span>}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={added}
        onClick={() => onAdd(card)}
        aria-label={added ? `${card.name} is in your deck` : `Add ${card.name} to deck`}
        className={`h-8 shrink-0 self-center rounded-lg px-2.5 text-xs font-medium ${added ? "border border-emerald-600 text-emerald-400" : "btn-primary"}`}
      >
        {added ? "In deck ✓" : "+ Add"}
      </button>
    </li>
  );
}
