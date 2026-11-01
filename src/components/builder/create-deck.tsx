"use client";

import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "motion/react";
import { useEffect, useId, useMemo, useState, ViewTransition } from "react";
import { toast } from "sonner";
import { BRACKET_STYLE } from "@/components/deck-beta/bracket-badge";
import { useBinder } from "@/lib/binder/store";
import { rememberDetails, useCardDetails } from "@/lib/binder/card-cache";
import { isBasicLandName } from "@/lib/binder/collection";
import { STEP, STEPS, togglePlaystyle, useBuilderDraft, type DraftPlaystyle } from "@/lib/builder/draft";
import { builderRecommendations, fitsIdentity, mergePlaystyles, predictedAverage, recommendLands, splitBasics, withPlaystyle, type BuilderCandidate } from "@/lib/builder/plan";
import { commanderGamePlan } from "@/lib/deck-beta/game-plan";
import { manaBasePlan } from "@/lib/deck-beta/lands";
import { cardTraits, subtypeVocabulary } from "@/lib/deck-beta/synergy";
import { curveAdvice } from "../deck-beta/template-bits";
import { bracketLabel, estimateDeckBracket } from "@/lib/deck-beta/bracket";
import { cardKey } from "@/lib/deck-beta/recommend";
import { requestPlaystyle, retryBuilderData, useBuilderData, useDeckAnalysis, useDeckLibrary, useFixingLands, usePlaystyles } from "@/lib/deck-beta/store";
import { useGameChangers } from "@/lib/use-game-changers";
import type { CardDetails } from "@/lib/types";
import { AppLink as Link, useAppRouter } from "../app-link";
import { FEATURES, morphName } from "../theme/features";
import { FeatureBadge } from "../theme/page-header";
import { BuildStep, RecommendedLands } from "./build-step";
import { CurveStep } from "./curve-step";
import { DeckRail } from "./deck-rail";
import { BracketStep, CommanderStep, LandsStep, PlaystyleStep, SynergyStep } from "./steps";

/** Wait this long after the last card goes in before asking for the deck's combos again. */
const ANALYSIS_SETTLE_MS = 1500;

const HEADINGS = [
  { title: "Choose your commander", note: "Every deck starts here. These are the commanders in your binder." },
  { title: "Choose a playstyle", note: "Every way players build this commander. The whole deck follows the one you pick." },
  { title: "Pick a bracket", note: "How strong should it be? Recommendations stay inside it, and anything stronger is set apart." },
  { title: "What EDHREC knows", note: "The cards that suit your commander best, and the ways players build it." },
  { title: "Set your lands", note: "Start from the recommendation; basics re-balance as the deck grows." },
  { title: "Build the deck", note: "Recommendations follow the deck: each card you add changes what it needs next." },
  { title: "Perfect the mana curve", note: "Cut what pushes your deck past the average curve, the weakest cards first." },
  { title: "Name it", note: "Save it to My Decks. You can price what’s missing from there." },
];

const ease = [0.23, 1, 0.32, 1] as const;

/**
 * Create Commander Deck: a step-by-step build, from picking a commander in the
 * binder to a named deck in My Decks. The deck itself sits beside every step
 * and grows as cards go in; cards not in the binder stay grayed out.
 */
export function CreateDeck() {
  const router = useAppRouter();
  const { draft, ready, update, chooseCommander, addCard, removeCard, reset } = useBuilderDraft();
  const binder = useBinder();
  const library = useDeckLibrary();
  const gameChangers = useGameChangers();
  const [direction, setDirection] = useState(1);
  // The mana curve slot clicked in the Build step, to see the cards at that cost.
  const [curvePick, setCurvePick] = useState<number>();

  const binderNames = useMemo(() => binder.cards.map((c) => c.name), [binder.cards]);
  const deckNames = draft.cards.map((c) => c.name);
  const commanderName = draft.commander?.name;
  const { detailsFor, status, known } = useCardDetails([...binderNames, ...deckNames, ...(commanderName ? [commanderName] : [])]);

  const commanderRef = useMemo(
    () => (draft.commander ? ({ name: draft.commander.name, layout: draft.commander.layout } as CardDetails) : undefined),
    [draft.commander],
  );
  const builder = useBuilderData(commanderRef);
  const data = builder?.state === "done" && builder.result.found ? builder.result : null;
  useEffect(() => {
    if (data) rememberDetails(Object.values(data.details));
  }, [data]);

  const identity = draft.commander?.colorIdentity ?? [];
  const identityKey = identity.join("");
  const chosen = draft.themes;
  const themeName = chosen.length > 0 ? chosen.map((t) => t.name).join(" + ") : undefined;
  const playstyles = usePlaystyles(commanderRef, chosen.map((t) => t.slug), identity);
  const stylesFound = chosen.flatMap((t, i) => {
    const state = playstyles[i];
    return state?.state === "done" && state.result.found ? [{ name: t.name, style: state.result }] : [];
  });
  const styleFailed = playstyles.some((p) => p?.state === "error" || (p?.state === "done" && !p.result.found));
  const styleLoading = !styleFailed && stylesFound.length < chosen.length;
  const stylesKey = stylesFound.map((s) => s.name).join("\n");
  // Recomputed when the set of playstyles in hand changes; each one's data stays as it came.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const style = useMemo(() => mergePlaystyles(stylesFound), [stylesKey]);
  const themeCards = style?.cards;
  useEffect(() => {
    if (style) rememberDetails(Object.values(style.details));
  }, [style]);
  // What EDHREC knows, narrowed to the chosen playstyle's decks once they're in.
  const styled = useMemo(() => (data && style ? withPlaystyle(data, style) : data), [data, style]);

  // The deck's combos, asked for once the deck stops changing for a moment.
  const deckKey = deckNames.join("\n");
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(deckKey), ANALYSIS_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [deckKey]);
  // Only once the deck has cards: an empty deck has no combos to find.
  const analysis = useDeckAnalysis(draft.step >= STEP.build && settled ? commanderRef : undefined, settled ? settled.split("\n") : []);
  const analysisResult = analysis?.state === "done" ? analysis.result : undefined;
  useEffect(() => {
    if (analysisResult) rememberDetails(Object.values(analysisResult.missing));
  }, [analysisResult]);

  const commanderCard = commanderName ? detailsFor(commanderName) : undefined;
  const fixingLands = useFixingLands(identity);
  useEffect(() => {
    if (fixingLands) rememberDetails(fixingLands);
  }, [fixingLands]);
  const deckCards = draft.cards.map((c) => detailsFor(c.name)).filter((d): d is CardDetails => Boolean(d));
  const deck = [...(commanderCard ? [{ card: commanderCard, qty: 1 }] : []), ...deckCards.map((card) => ({ card, qty: 1 }))];
  const isLand = (c: CardDetails) => /\bLand\b/.test(c.typeLine.split(" // ")[0]);
  const nonbasicLands = deckCards.filter(isLand).length;
  const spells = deckCards.length - nonbasicLands;

  const candidates = useMemo(() => {
    const out: BuilderCandidate[] = [];
    const seen = new Set<string>();
    const push = (card: CardDetails, extra: Partial<BuilderCandidate> = {}) => {
      if (seen.has(cardKey(card.name)) || isBasicLandName(card.name)) return;
      seen.add(cardKey(card.name));
      out.push({ card, lists: [], ownedCopies: binder.owned(card.name), ...extra });
    };
    // The commander's cards with their EDHREC lists, then what only the playstyle plays; the plan puts the playstyle's numbers on them.
    for (const source of [data, styled]) {
      for (const c of source?.cards ?? []) {
        const card = source!.details[c.name] ?? detailsFor(c.name);
        if (card) push(card, { synergy: c.synergy, inclusion: c.inclusion, lists: c.lists });
      }
    }
    for (const card of fixingLands ?? []) push(card);
    for (const name of binderNames) {
      const card = detailsFor(name);
      if (card && fitsIdentity(card, identity)) push(card);
    }
    for (const card of Object.values(analysisResult?.missing ?? {})) push(card);
    return out;
    // "known" changes as details arrive, which is when this needs redoing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styled, data, fixingLands, binder.cards, analysisResult, known, identityKey]);

  // Lands by the curve: EDHREC's decks for the commander, or (until a deck has
  // spells) the curve of the cards those decks play most.
  const expectedCurve = useMemo(() => styled?.curveAverage ?? predictedAverage(candidates), [styled, candidates]);
  const recommended = draft.commander && draft.bracket ? recommendLands({ curveAverage: expectedCurve }) : undefined;
  const lands = draft.lands ?? recommended?.count ?? 38;
  const basics = Math.max(0, lands - nonbasicLands);
  const basicSplit = splitBasics(basics, identity, deckCards.map((c) => c.manaCost ?? ""));
  const spellTarget = 99 - lands;
  const manaBase = manaBasePlan(identity.length, lands);

  // The commander's game plan: what it does and wants, read like the deck's cards, with how EDHREC's decks build it.
  // Cheap to work out, so it isn't memoized (the commander's details come from a cache).
  const gamePlan = commanderCard
    ? commanderGamePlan({
        commander: commanderCard,
        traits: cardTraits(commanderCard, subtypeVocabulary([commanderCard, ...candidates.slice(0, 120).map((x) => x.card)])),
        themes: data?.themes,
        numDecks: data?.numDecks,
        averages: styled?.averages,
        curveAverage: styled?.curveAverage,
        playstyle: style && themeName ? { name: themeName, numDecks: style.numDecks } : undefined,
      })
    : undefined;

  const plan = useMemo(() => {
    if (!draft.bracket || deck.length === 0) return null;
    return builderRecommendations({
      deck,
      candidates: candidates.filter((c) => cardKey(c.card.name) !== cardKey(commanderName ?? "")),
      identity,
      bracket: draft.bracket,
      isGameChanger: gameChangers.has,
      combos: analysisResult?.combos,
      playstyle: themeCards,
      curveCounts: styled?.curveCounts,
      preferOwned: draft.preferOwned,
      commander: commanderName,
      lands,
    });
    // The deck key and the inputs above capture what the plan depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, deckKey, commanderCard, draft.bracket, analysisResult, themeCards, styled, draft.preferOwned, gameChangers, lands]);

  const report = useMemo(
    () =>
      deck.length > 0
        ? estimateDeckBracket({
            cards: deck.map((d) => d.card),
            isGameChanger: gameChangers.has,
            combos: analysisResult?.combos,
            spellbook: analysisResult?.bracket,
            tutors: plan?.profile.roles.tutor.length ?? 0,
          })
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckKey, commanderCard, analysisResult, gameChangers, plan],
  );

  const commanders = binderNames
    .map((n) => detailsFor(n))
    .filter((d, i, all): d is CardDetails => Boolean(d?.canBeCommander) && all.findIndex((x) => x?.name === d!.name) === i);

  if (!ready) return <p className="text-muted">Loading…</p>;

  const step = draft.step;
  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setCurvePick(undefined);
    if (next === STEP.lands && draft.lands === undefined && recommended) update({ step: next, lands: recommended.count });
    else update({ step: next });
    window.scrollTo({ top: 0 });
  };
  const edhrecDone = builder?.state === "done" || builder?.state === "error";
  const notFound = builder?.state === "done" && !builder.result.found;
  const canContinue = [Boolean(draft.commander), edhrecDone, Boolean(draft.bracket), edhrecDone, true, true, true, false][step];
  const toggleTheme = (theme: DraftPlaystyle) => update({ themes: togglePlaystyle(draft.themes, theme) });
  const retryStyles = () => chosen.forEach((t, i) => playstyles[i]?.state !== "done" && requestPlaystyle(commanderRef!, t.slug, true, identity));
  const playstyleContext = { commander: commanderRef, colors: identity };
  const edhrecWait = builder?.state === "waiting" ? `Waiting ${builder.seconds}s because ${builder.reason}…` : null;

  function add(card: CardDetails) {
    addCard(card.name);
    if (!binder.owned(card.name)) toast(`${card.name} added`, { description: "Not in your binder: it’ll be on the list of cards to buy." });
  }

  function save(name: string) {
    if (!draft.commander) return;
    const id = library.create({
      name,
      commander: draft.commander.name,
      cards: [{ name: draft.commander.name, qty: 1 }, ...draft.cards, ...Object.entries(basicSplit).map(([basic, qty]) => ({ name: basic, qty }))],
      bracket: draft.bracket,
      theme: themeName,
      commanderImage: draft.commander.imageUrl,
    });
    toast.success(`${name} saved to My Decks`);
    reset();
    router.push(`/decks?new=${id}`);
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="flex flex-col gap-10">
          <header className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                {/* The front page's tile morphs into this badge; the title changes per step, so it doesn't morph. */}
                <ViewTransition name={morphName("create", "icon")} share="morph" default="none">
                  <FeatureBadge Icon={FEATURES.create.Icon} />
                </ViewTransition>
                <div className="min-w-0">
                  <p className="eyebrow">Create Commander Deck</p>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, filter: "blur(4px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } }}
                      transition={{ duration: 0.25, ease }}
                    >
                      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">{HEADINGS[step].title}</h1>
                      <p className="mt-1 max-w-xl text-muted">{HEADINGS[step].note}</p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              {(draft.commander || draft.cards.length > 0) && <StartOver onReset={reset} />}
            </div>
            <Stepper step={step} reached={stepReached(draft)} onGo={go} />
          </header>

          <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <DeckRail
              commander={draft.commander}
              cards={deckCards}
              basics={step >= STEP.lands ? basics : 0}
              profile={step >= STEP.build ? plan?.profile : undefined}
              template={step === STEP.finish}
              curvePick={step === STEP.build ? curvePick : undefined}
              onCurvePick={step === STEP.build ? (slot) => setCurvePick(slot === curvePick ? undefined : slot) : undefined}
              report={step >= STEP.build ? report : undefined}
              combosFound={analysisResult?.combos?.included.length}
              onRemove={removeCard}
            />

            <div className="min-w-0">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.section
                  key={step}
                  custom={direction}
                  initial={{ opacity: 0, transform: `translateX(${direction * 24}px)` }}
                  animate={{ opacity: 1, transform: "translateX(0px)" }}
                  exit={{ opacity: 0, transform: `translateX(${direction * -16}px)`, transition: { duration: 0.15, ease } }}
                  transition={{ duration: 0.3, ease }}
                >
                  {step === STEP.commander && (
                    <CommanderStep
                      commanders={commanders}
                      binderSize={binder.cards.length}
                      status={status}
                      owned={binder.owned}
                      selected={draft.commander?.name}
                      onChoose={chooseCommander}
                    />
                  )}
                  {step === STEP.playstyle && draft.commander && (
                    <PlaystyleStep
                      commander={draft.commander}
                      data={data}
                      loading={edhrecWait}
                      failed={builder?.state === "error"}
                      notFound={notFound}
                      onRetry={() => retryBuilderData(draft.commander!)}
                      chosen={chosen}
                      themeName={themeName}
                      onToggle={toggleTheme}
                      onClear={() => update({ themes: [] })}
                      style={style}
                      styleLoading={styleLoading}
                      styleFailed={styleFailed}
                      onRetryStyle={retryStyles}
                      owned={binder.owned}
                      context={playstyleContext}
                    />
                  )}
                  {step === STEP.bracket && draft.commander && (
                    <BracketStep
                      commander={draft.commander.name}
                      themeName={themeName}
                      counts={styled?.bracketCounts}
                      selected={draft.bracket}
                      onChoose={(bracket) => update({ bracket })}
                    />
                  )}
                  {step === STEP.synergies && draft.commander && (
                    <SynergyStep
                      commander={draft.commander}
                      data={styled}
                      loading={edhrecWait}
                      failed={builder?.state === "error"}
                      notFound={notFound}
                      onRetry={() => retryBuilderData(draft.commander!)}
                      owned={binder.owned}
                      themeName={themeName}
                      onChangeTheme={() => go(STEP.playstyle)}
                      preferOwned={draft.preferOwned}
                      onPreferOwned={(preferOwned) => update({ preferOwned })}
                      plan={gamePlan}
                    />
                  )}
                  {step === STEP.lands && recommended && (
                    <>
                      <LandsStep
                        recommended={recommended.count}
                        why={recommended.why}
                        lands={lands}
                        onLands={(n) => update({ lands: n })}
                        colors={identity}
                        nonbasicLands={nonbasicLands}
                        manaCosts={deckCards.map((c) => c.manaCost ?? "")}
                        manaBase={manaBase}
                      />
                      {plan && <RecommendedLands lands={plan.lands} preferOwned={draft.preferOwned} ownedFor={binder.owned} onAdd={add} />}
                    </>
                  )}
                  {step === STEP.build &&
                    (plan ? (
                      <BuildStep
                        groups={plan}
                        profile={plan.profile}
                        landTarget={plan.manaBase.nonbasics}
                        lands={lands}
                        basicSplit={basicSplit}
                        preferOwned={draft.preferOwned}
                        ownedFor={binder.owned}
                        onAdd={add}
                        spells={spells}
                        spellTarget={spellTarget}
                        curvePick={curvePick}
                        onClearCurvePick={() => setCurvePick(undefined)}
                        themes={data?.themes ?? []}
                        chosen={chosen}
                        themeName={themeName}
                        onToggleTheme={toggleTheme}
                        onClearThemes={() => update({ themes: [] })}
                        playstyleContext={playstyleContext}
                        styleLoading={styleLoading}
                        styleFailed={styleFailed}
                        onRetryStyle={retryStyles}
                        leftOut={plan.leftOut.length}
                        bracket={draft.bracket ?? 3}
                        has={(name) => deckCards.some((c) => cardKey(c.name) === cardKey(name)) || cardKey(name) === cardKey(commanderName ?? "")}
                        curveAdvice={curveAdvice(plan.profile.curve)}
                        landAdvice={plan.manaBase.advice}
                      />
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-muted">
                        <span aria-hidden className="spinner size-4" /> Getting the recommendations ready…
                      </p>
                    ))}
                  {step === STEP.curve &&
                    (plan ? (
                      <CurveStep
                        curve={plan.profile.curve}
                        slots={plan.curveSlots}
                        averageTarget={styled?.curveAverage}
                        usesEdhrec={Boolean(styled?.curveCounts)}
                        themeName={themeName}
                        total={1 + deckCards.length + basics}
                        ownedFor={binder.owned}
                        onRemove={removeCard}
                        onFind={(slot) => {
                          go(STEP.build);
                          setCurvePick(slot);
                        }}
                      />
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-muted">
                        <span aria-hidden className="spinner size-4" /> Reading the deck’s curve…
                      </p>
                    ))}
                  {step === STEP.finish && draft.commander && (
                    <FinishStep
                      defaultName={`${draft.commander.name.split(",")[0]}${themeName ? ` · ${themeName}` : ""}`}
                      total={1 + deckCards.length + basics}
                      spells={spells}
                      nonbasicLands={nonbasicLands}
                      basics={basics}
                      missing={[draft.commander.name, ...deckNames].filter((n) => binder.owned(n) === 0).length}
                      bracket={report ? bracketLabel(report) : undefined}
                      bracketStyle={report ? BRACKET_STYLE[report.bracket] : undefined}
                      onSave={save}
                    />
                  )}
                </motion.section>
              </AnimatePresence>

              {step < STEP.finish && (
                <div className="mt-12 flex items-center justify-between border-t border-line pt-6">
                  {step > 0 ? (
                    <button type="button" onClick={() => go(step - 1)} className="btn btn-ghost">
                      ← Back
                    </button>
                  ) : (
                    <Link href="/decks" className="btn btn-ghost">
                      My Decks
                    </Link>
                  )}
                  <button type="button" disabled={!canContinue} onClick={() => go(step + 1)} data-cast className="btn btn-primary btn-lg">
                    {step === STEP.curve ? "Finish" : "Continue"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

/** The furthest step the draft can be on. */
function stepReached(draft: ReturnType<typeof useBuilderDraft>["draft"]) {
  if (!draft.commander) return STEP.commander;
  if (!draft.bracket) return STEP.bracket;
  return Math.max(draft.step, STEP.synergies);
}

function Stepper({ step, reached, onGo }: { step: number; reached: number; onGo: (step: number) => void }) {
  return (
    <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto text-xs">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-1">
          <button
            type="button"
            disabled={i > reached}
            onClick={() => onGo(i)}
            aria-current={i === step ? "step" : undefined}
            className={`flex items-center gap-2 rounded-full px-2.5 py-1 transition-colors duration-150 ${
              i === step ? "text-foreground" : i <= reached ? "text-muted hover:text-foreground" : "text-muted/50"
            }`}
          >
            <span
              className={`flex size-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums transition-colors duration-200 ${
                i === step ? "bg-accent text-on-accent" : i < step ? "bg-subtle text-foreground" : "border border-line"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span className="whitespace-nowrap">{label}</span>
          </button>
          {i < STEPS.length - 1 && (
            <span aria-hidden className="block h-px w-4 overflow-hidden bg-line">
              <span className="block h-full origin-left bg-accent transition-transform duration-300 ease-out" style={{ transform: `scaleX(${i < step ? 1 : 0})` }} />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function StartOver({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (confirming ? onReset() : setConfirming(true))}
      onBlur={() => setConfirming(false)}
      className="btn btn-ghost btn-sm text-muted"
    >
      {confirming ? "Click again to start over" : "Start over"}
    </button>
  );
}

/** 6. Name the deck and save it to My Decks. */
function FinishStep({
  defaultName,
  total,
  spells,
  nonbasicLands,
  basics,
  missing,
  bracket,
  bracketStyle,
  onSave,
}: {
  defaultName: string;
  total: number;
  spells: number;
  nonbasicLands: number;
  basics: number;
  missing: number;
  bracket?: string;
  bracketStyle?: string;
  onSave: (name: string) => void;
}) {
  const id = useId();
  const [name, setName] = useState(defaultName);
  return (
    <form
      className="flex max-w-lg flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name.trim() || defaultName);
      }}
    >
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          Deck name
        </label>
        <input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="field mt-2 h-11 text-base" autoFocus />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-6 text-sm">
        <div>
          <dt className="text-muted">Cards</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{total} / 100</dd>
        </div>
        <div>
          <dt className="text-muted">Bracket</dt>
          <dd className="mt-1">{bracket ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${bracketStyle}`}>{bracket}</span> : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Spells</dt>
          <dd className="mt-0.5 tabular-nums">{spells}</dd>
        </div>
        <div>
          <dt className="text-muted">Lands</dt>
          <dd className="mt-0.5 tabular-nums">
            {nonbasicLands + basics} ({basics} basic)
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted">Not in your binder</dt>
          <dd className="mt-0.5 tabular-nums">
            {missing} {missing === 1 ? "card" : "cards"}
            {missing > 0 && <span className="text-muted"> · right-click the deck in My Decks to add them to Shopping</span>}
          </dd>
        </div>
      </dl>
      {total < 100 && <p className="text-sm text-muted">The deck has {total} of 100 cards. You can save it now and finish it later in Deck Synergy.</p>}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary btn-lg">
          Save to My Decks
        </button>
      </div>
    </form>
  );
}
