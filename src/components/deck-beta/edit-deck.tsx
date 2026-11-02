"use client";

import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useBinder } from "@/lib/binder/store";
import { useCardDetails } from "@/lib/binder/card-cache";
import { builderRecommendations, byCardType, fitsIdentity, type BuilderCandidate } from "@/lib/builder/plan";
import { isBasicLandName } from "@/lib/binder/collection";
import type { Bracket, BracketReport } from "@/lib/deck-beta/bracket";
import { CURVE_LABELS, slotOf } from "@/lib/deck-beta/curve";
import { colorDistribution } from "@/lib/deck-beta/lands";
import type { RelatedCard } from "@/lib/deck-beta/related";
import { cardKey } from "@/lib/deck-beta/recommend";
import { CATEGORY_INFO, type DeckProfile } from "@/lib/deck-beta/roles";
import { useBuilderData, useDeckRelated, useTargetBracket, type DeckSource } from "@/lib/deck-beta/store";
import { cardTraits, interactionsOf, partnersOf, type DeckAnalysis } from "@/lib/deck-beta/synergy";
import { formatCount, formatPercent } from "@/lib/format";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { CardDetails, ChosenPrinting, DeckCombos } from "@/lib/types";
import { useGameChangers } from "@/lib/use-game-changers";
import { BuildCard } from "../builder/build-card";
import { GameChangerTag } from "../game-changer-tag";
import { ManaCost, Pip } from "../mana";
import { HoverName } from "./bits";
import { LazyCardImage } from "./lazy-card-image";
import { OddsCalculator } from "./odds-calculator";
import { PrintingPicker } from "./printing-picker";
import { curveAdvice, CurveChart } from "./template-bits";

/** Recommended cards per short category, and synergistic cards in all. */
const SHORT_PICKS = 6;
const SYNERGY_PICKS = 12;

type DeckLine = { card: CardDetails; qty: number };

/**
 * Editing a deck: its mana curve and colors, its cards with a printing for
 * each, the odds of drawing what it needs, the tokens and partners it brings,
 * and cards to add.
 */
export function EditDeck({
  source,
  commander,
  deckCards,
  profile,
  analysis,
  report,
  combos,
  inDeck,
}: {
  source: DeckSource;
  commander?: CardDetails;
  /** Every card in the deck once, with its copies. */
  deckCards: DeckLine[];
  profile: DeckProfile;
  analysis: DeckAnalysis;
  report: BracketReport;
  combos: DeckCombos | null | undefined;
  inDeck: (name: string) => boolean;
}) {
  const binder = useBinder();
  const gameChangers = useGameChangers();
  const [chosenBracket] = useTargetBracket();
  const [costPick, setCostPick] = useState<number>();
  const [pickingFor, setPickingFor] = useState<CardDetails | null>(null);
  const builder = useBuilderData(commander ? { name: commander.name, layout: commander.layout } : undefined);
  const data = builder?.state === "done" && builder.result.found ? builder.result : null;
  const identity = commander?.colorIdentity ?? analysis.colors;
  const landCount = profile.lands;
  const deckKey = deckCards.map((d) => `${d.card.name}×${d.qty}`).join("\n");

  const plan = useMemo(() => {
    if (!data) return null;
    const candidates: BuilderCandidate[] = data.cards.flatMap((c) => {
      const card = data.details[c.name];
      return card && !isBasicLandName(card.name) ? [{ card, synergy: c.synergy, inclusion: c.inclusion, lists: c.lists, ownedCopies: binder.owned(card.name) }] : [];
    });
    return builderRecommendations({
      deck: deckCards,
      candidates: candidates.filter((c) => cardKey(c.card.name) !== cardKey(commander?.name ?? "")),
      identity,
      bracket: (chosenBracket || report.bracket) as Bracket,
      isGameChanger: gameChangers.has,
      combos,
      curveCounts: data.curveCounts,
      preferOwned: false,
      commander: commander?.name,
      lands: landCount,
    });
    // The deck key captures the deck's cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, deckKey, commander, chosenBracket, report.bracket, combos, gameChangers, binder.cards, landCount]);

  // The cards on offer that work with the most of the deck, read from their rules text.
  const synergistic = useMemo(() => {
    if (!plan) return [];
    const offered = plan.template.flatMap((s) => s.lists.flatMap((l) => l.picks));
    const unique = [...new Map(offered.map((p) => [cardKey(p.card.name), p])).values()];
    return unique
      .map((pick) => ({ pick, partners: partnersOf(interactionsOf(cardTraits(pick.card, analysis.vocabulary), analysis.traits, pick.card.name)).size }))
      .filter((p) => p.partners > 0)
      .sort((a, b) => b.partners - a.partners || (b.pick.synergy ?? -1) - (a.pick.synergy ?? -1))
      .slice(0, SYNERGY_PICKS)
      .map(({ pick, partners }) => ({ ...pick, reason: `Works with ${formatCount(partners)} of your cards` }));
  }, [plan, analysis]);

  const colors = useMemo(() => colorDistribution(deckCards, identity), [deckCards, identity]);
  const curve = plan ? { ...profile.curve, targets: plan.curveSlots.map((s) => s.target) } : profile.curve;
  const shown = costPick === undefined ? deckCards : deckCards.filter(({ card }) => !/\bLand\b/.test(card.typeLine.split(" // ")[0]) && slotOf(card.cmc) === costPick);
  const printingOf = (name: string) => source.printings?.[cardKey(name)];
  const short = (plan?.template ?? []).filter((s) => s.short > 0 && s.all.leaning.length + s.all.synergy.length > 0).sort((a, b) => b.short / CATEGORY_INFO[b.category].target - a.short / CATEGORY_INFO[a.category].target);

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="font-semibold">Mana curve</h3>
          <p className="mb-6 text-xs text-muted">
            Spells by mana value, against {data?.curveCounts ? "the average deck for this commander on EDHREC" : "a low, wide curve"}. Click a cost to see your cards at it. {curveAdvice(profile.curve)}
          </p>
          <CurveChart curve={curve} picked={costPick} onPick={(slot) => setCostPick(slot === costPick ? undefined : slot)} />
        </section>
        <section>
          <h3 className="font-semibold">Color distribution</h3>
          <p className="mb-4 text-xs text-muted">The colored mana your spells ask for, against what your lands can make. Duals count for each of their colors.</p>
          <ColorChart colors={colors} />
        </section>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h3 className="font-semibold">
              {costPick === undefined ? "Cards" : `Cards at ${CURVE_LABELS[costPick]} mana`}
              {costPick !== undefined && (
                <button type="button" onClick={() => setCostPick(undefined)} className="link ml-3 text-sm font-normal text-muted">
                  Show all
                </button>
              )}
            </h3>
            <p className="text-xs text-muted">{source.setPrinting ? "Pick a printing for any card: its set, Showcase, Borderless and Retro Frame art, or promos." : "Save this deck to My Decks to pick printings."}</p>
          </div>
          <AddCard identity={identity} inDeck={inDeck} onAdd={source.add} />
        </div>
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          {byCardType(shown).map((group) => (
            <div key={group.type}>
              <p className="eyebrow mb-1">
                {group.type} <span className="tabular-nums">{group.picks.reduce((sum, p) => sum + p.qty, 0)}</span>
              </p>
              <ul>
                {[...group.picks]
                  .sort((a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name))
                  .map((line) => (
                    <DeckRow
                      key={line.card.name}
                      line={line}
                      printing={printingOf(line.card.name)}
                      canPick={Boolean(source.setPrinting)}
                      onPick={() => setPickingFor(line.card)}
                      onQty={(qty) => source.addList([{ name: line.card.name, qty }])}
                      onRemove={() => source.remove(line.card.name)}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-semibold">Draw odds</h3>
        <p className="mb-4 text-xs text-muted">The chance of drawing what you need, from the cards in this deck. Opening hands are 7 cards, and you draw one a turn after your first.</p>
        <OddsCalculator deckCards={deckCards} profile={profile} commander={commander?.name} />
      </section>

      <RelatedSection names={deckCards.map((d) => d.card.name)} inDeck={inDeck} />

      <section className="flex flex-col gap-6">
        <div>
          <h3 className="font-semibold">Recommendations</h3>
          <p className="text-xs text-muted">From EDHREC’s {commander?.name ?? "commander’s"} decks, what your deck is short of and what works with the cards you’ve already got.</p>
        </div>
        {!commander ? (
          <p className="text-sm text-muted">Pick a commander to see recommendations.</p>
        ) : !plan ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="spinner size-4" /> Reading EDHREC’s decks for {commander.name}…
          </p>
        ) : (
          <>
            <PickGrid title="Synergistic with your deck" picks={synergistic} owned={binder.owned} onAdd={source.add} />
            {short.map((shelf) => (
              <PickGrid
                key={shelf.category}
                title={`${CATEGORY_INFO[shelf.category].label}: ${formatCount(shelf.short)} short`}
                picks={[...shelf.all.leaning, ...shelf.all.synergy].slice(0, SHORT_PICKS)}
                owned={binder.owned}
                onAdd={source.add}
              />
            ))}
          </>
        )}
      </section>

      {pickingFor && source.setPrinting && (
        <PrintingPicker key={pickingFor.name} card={pickingFor} chosen={printingOf(pickingFor.name)} onChoose={(printing) => source.setPrinting!(pickingFor.name, printing)} onClose={() => setPickingFor(null)} />
      )}
    </div>
  );
}

/** Each color's share of the deck's mana symbols beside its share of the lands' sources. */
function ColorChart({ colors }: { colors: ReturnType<typeof colorDistribution> }) {
  if (colors.colors.length === 0) return <p className="text-sm text-muted">This deck has no colors to balance.</p>;
  return (
    <div className="flex flex-col gap-4">
      {colors.colors.map((c) => (
        <div key={c.color} className="grid grid-cols-[1.5rem_1fr] items-start gap-2">
          <Pip symbol={c.color} className="mt-0.5" />
          <div className="flex flex-col gap-1">
            <ColorBar label="Spells ask for" share={c.pipShare} detail={`${formatPercent(c.pipShare)} · ${formatCount(Math.round(c.pips))} symbols`} />
            <ColorBar label="Lands make" share={c.sourceShare} detail={`${formatPercent(c.sourceShare)} · ${formatCount(c.sources)} lands`} muted />
            {c.short >= 2 && <p className="text-xs text-amber-400">About {formatCount(c.short)} sources short for how much your spells ask of it.</p>}
          </div>
        </div>
      ))}
      {colors.colorless > 0 && (
        <p className="text-xs text-muted">
          {formatCount(colors.colorless)} of your {formatCount(colors.lands)} lands {colors.colorless === 1 ? "makes" : "make"} none of your colors.
        </p>
      )}
    </div>
  );
}

function ColorBar({ label, share, detail, muted = false }: { label: string; share: number; detail: string; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-subtle">
        <span className={`block h-full origin-left rounded-full transition-transform duration-300 ease-out ${muted ? "bg-foreground/50" : "bg-accent"}`} style={{ transform: `scaleX(${share})` }} />
      </span>
      <span className="text-right text-muted tabular-nums">{detail}</span>
    </div>
  );
}

function DeckRow({
  line,
  printing,
  canPick,
  onPick,
  onQty,
  onRemove,
}: {
  line: DeckLine;
  printing?: ChosenPrinting;
  canPick: boolean;
  onPick: () => void;
  onQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const { card, qty } = line;
  const steps = qty > 1 || /\bBasic\b/.test(card.typeLine);
  return (
    <li className="flex items-center gap-2 border-b border-line py-1.5 text-sm last:border-0">
      {steps ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => (qty > 1 ? onQty(qty - 1) : onRemove())} aria-label={`One fewer ${card.name}`} className="flex size-5 items-center justify-center rounded text-muted hover:bg-subtle hover:text-foreground">
            −
          </button>
          <span className="w-5 text-center text-xs tabular-nums">{qty}</span>
          <button type="button" onClick={() => onQty(qty + 1)} aria-label={`One more ${card.name}`} className="flex size-5 items-center justify-center rounded text-muted hover:bg-subtle hover:text-foreground">
            +
          </button>
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="h-9 w-6.5 shrink-0 overflow-hidden rounded-[8%] bg-subtle">
          <LazyCardImage url={printing?.imageUrl ?? card.imageUrl} alt="" />
        </span>
        <HoverName name={card.name} className="min-w-0 truncate rounded-sm text-left hover:text-accent" />
        <GameChangerTag name={card.name} compact />
      </span>
      {card.manaCost && (
        <span className="hidden shrink-0 sm:inline-flex">
          <ManaCost cost={card.manaCost.split(" // ")[0]} />
        </span>
      )}
      {canPick && (
        <button
          type="button"
          onClick={onPick}
          title={printing ? `${printing.setName} #${printing.collectorNumber}` : "Pick a printing"}
          aria-label={`Pick a printing of ${card.name}`}
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors ${printing ? "border-accent/50 text-accent" : "border-line text-muted hover:border-line-strong hover:text-foreground"}`}
        >
          {printing ? printing.setCode : "Printing"}
        </button>
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove ${card.name}`} className="flex size-5 shrink-0 items-center justify-center rounded text-muted hover:bg-subtle hover:text-foreground">
        ×
      </button>
    </li>
  );
}

/** Any card by name, in the commander's colors. */
function AddCard({ identity, inDeck, onAdd }: { identity: string[]; inDeck: (name: string) => boolean; onAdd: (card: CardDetails) => void }) {
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const { detailsFor } = useCardDetails(names);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void fetchJsonWithRetry<{ names?: string[] }>(`/api/autocomplete?q=${encodeURIComponent(q)}`, { busyReason: "Scryfall is busy" }).then((r) => {
        if (r !== "error") setNames((r.names ?? []).slice(0, 6));
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const found = query.trim().length >= 2 ? names.map(detailsFor).filter((d): d is CardDetails => Boolean(d) && !inDeck(d!.name) && fitsIdentity(d!, identity)) : [];
  return (
    <div className="relative w-full sm:w-64">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add a card" aria-label="Add a card" className="field h-9 w-full" />
      {found.length > 0 && (
        <ul className="pop-in absolute top-full right-0 z-30 mt-1 w-full overflow-hidden rounded-xl border border-line-strong bg-surface py-1 shadow-[0_24px_60px_-16px_rgb(0_0_0/0.75)] [--transform-origin:right_top]">
          {found.map((card) => (
            <li key={card.name}>
              <button
                type="button"
                onClick={() => {
                  onAdd(card);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-subtle"
              >
                <span className="min-w-0 truncate">{card.name}</span>
                {card.manaCost && <ManaCost cost={card.manaCost.split(" // ")[0]} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The tokens, emblems, game pieces and partners the deck's cards bring. */
function RelatedSection({ names, inDeck }: { names: string[]; inDeck: (name: string) => boolean }) {
  const state = useDeckRelated(names);
  const related = state?.state === "done" ? state.result : undefined;
  const empty = related && related.tokens.length + related.emblems.length + related.pieces.length + related.pairs.length === 0;
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h3 className="font-semibold">Tokens and related cards</h3>
        <p className="text-xs text-muted">What to have ready at the table: the tokens your deck makes, its emblems and game pieces, and the cards it melds with or transforms into.</p>
      </div>
      {state?.state === "error" ? (
        <p className="text-sm text-muted">Couldn’t reach Scryfall for these right now.</p>
      ) : !related ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="spinner size-4" /> Reading what your cards make…
        </p>
      ) : empty ? (
        <p className="text-sm text-muted">This deck doesn’t make any tokens or bring any extra pieces.</p>
      ) : (
        <>
          <RelatedGrid title="Tokens" cards={related.tokens} />
          <RelatedGrid title="Emblems" cards={related.emblems} />
          <RelatedGrid title="Game pieces" cards={related.pieces} />
          {related.pairs.length > 0 && (
            <div>
              <p className="eyebrow mb-2">
                Meld and transform partners <span className="tabular-nums">{related.pairs.length}</span>
              </p>
              <ul className="grid gap-x-8 gap-y-1 text-sm lg:grid-cols-2">
                {related.pairs.map((pair) => (
                  <li key={`${pair.from}|${pair.to}`} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                    <HoverName name={pair.from.split(" // ")[0]} className="min-w-0 truncate rounded-sm hover:text-accent" />
                    <span className="text-xs text-muted">{pair.how.toLowerCase()}</span>
                    <span className="min-w-0 truncate font-medium">{pair.to}</span>
                    {pair.how === "Melds with" && <span className={`text-xs ${inDeck(pair.to) ? "text-emerald-400" : "text-amber-400"}`}>{inDeck(pair.to) ? "in your deck" : "not in your deck"}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RelatedGrid({ title, cards }: { title: string; cards: RelatedCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div>
      <p className="eyebrow mb-2">
        {title} <span className="tabular-nums">{cards.length}</span>
      </p>
      <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-6">
        {cards.map((card) => (
          <li key={[card.name, card.stats, card.text].join("|")} className="min-w-0">
            <span className="block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle" title={card.text}>
              <LazyCardImage url={card.imageUrl} alt={card.name} />
            </span>
            <p className="mt-1 truncate text-xs font-medium" title={card.name}>
              {card.stats && <span className="tabular-nums">{card.stats} </span>}
              {card.name}
            </p>
            <p className="truncate text-[11px] text-muted" title={card.from.join(", ")}>
              {card.from.length === 1 ? card.from[0] : `${formatCount(card.from.length)} of your cards`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PickGrid({
  title,
  picks,
  owned,
  onAdd,
}: {
  title: string;
  picks: { card: CardDetails; categories?: import("@/lib/deck-beta/roles").Category[]; reason?: string }[];
  owned: (name: string) => number;
  onAdd: (card: CardDetails) => void;
}) {
  if (picks.length === 0) return null;
  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <AnimatePresence mode="popLayout" initial={false}>
          {picks.map((p, i) => (
            <BuildCard key={p.card.name} card={p.card} ownedCopies={owned(p.card.name)} categories={p.categories} reason={p.reason} index={i} flies={false} onAdd={onAdd} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
