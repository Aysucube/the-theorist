"use client";

import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBinder } from "@/lib/binder/store";
import { useCardDetails } from "@/lib/binder/card-cache";
import { builderRecommendations, byCardType, fitsIdentity, type BuilderCandidate } from "@/lib/builder/plan";
import { isBasicLandName } from "@/lib/binder/collection";
import type { Bracket, BracketReport } from "@/lib/deck-beta/bracket";
import { CURVE_LABELS, slotOf } from "@/lib/deck-beta/curve";
import type { RelatedCard } from "@/lib/deck-beta/related";
import { cardKey } from "@/lib/deck-beta/recommend";
import { CATEGORY_INFO, type DeckProfile } from "@/lib/deck-beta/roles";
import { useBuilderData, useDeckRelated, useTargetBracket, type DeckSource } from "@/lib/deck-beta/store";
import { cardTraits, interactionsOf, partnersOf, type DeckAnalysis } from "@/lib/deck-beta/synergy";
import { formatCount } from "@/lib/format";
import { fetchJsonWithRetry } from "@/lib/retry";
import type { CardDetails, ChosenPrinting, DeckCombos } from "@/lib/types";
import { useGameChangers } from "@/lib/use-game-changers";
import { BuildCard } from "../builder/build-card";
import { useHoverPreview } from "../card-link";
import { GameChangerTag } from "../game-changer-tag";
import { ManaCost } from "../mana";
import { HoverName } from "./bits";
import { ColorSection } from "./color-section";
import { LazyCardImage } from "./lazy-card-image";
import { OddsCalculator } from "./odds-calculator";
import { PrintingPicker } from "./printing-picker";
import { curveAdvice, CurveChart } from "./template-bits";

/** Recommended cards per short category, and synergistic cards in all. */
const SHORT_PICKS = 6;
const SYNERGY_PICKS = 12;

/** The side tabs jump here; this keeps a section's heading clear of what stays stuck to the top of the page. */
const ANCHOR = "scroll-mt-28 lg:scroll-mt-20";
const GALLERY = "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5";

type DeckLine = { card: CardDetails; qty: number };
type Jump = { id: string; label: string; count?: number; sub?: boolean };

const typeAnchor = (type: string) => `edit-cards-${type.toLowerCase().replace(/\W+/g, "-")}`;

/**
 * Editing a deck, with side tabs to each part: its mana curve and colors, its
 * cards with a version for each, the odds of drawing what it needs, the tokens
 * and partners it brings, and cards to add.
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

  const curve = plan ? { ...profile.curve, targets: plan.curveSlots.map((s) => s.target) } : profile.curve;
  const atCost = costPick === undefined ? [] : deckCards.filter(({ card }) => !/\bLand\b/.test(card.typeLine.split(" // ")[0]) && slotOf(card.cmc) === costPick);
  // What the colors can reach for: EDHREC's lands for this commander, and the spells the curve can spare, the most crowded cost first.
  const fixingLands = useMemo(() => (plan ? [...plan.lands.duals, ...plan.lands.fixing].map((p) => p.card) : []), [plan]);
  const spellCuts = useMemo(() => [...(plan?.curveSlots ?? [])].sort((a, b) => b.have - b.target - (a.have - a.target)).flatMap((slot) => slot.cards), [plan]);
  const printingOf = (name: string) => source.printings?.[cardKey(name)];
  const short = (plan?.template ?? []).filter((s) => s.short > 0 && s.all.leaning.length + s.all.synergy.length > 0).sort((a, b) => b.short / CATEGORY_INFO[b.category].target - a.short / CATEGORY_INFO[a.category].target);

  const byType = byCardType(deckCards);
  const copiesIn = (lines: DeckLine[]) => lines.reduce((sum, { qty }) => sum + qty, 0);
  const jumps: Jump[] = [
    { id: "edit-curve", label: "Mana curve" },
    { id: "edit-colors", label: "Color distribution" },
    { id: "edit-cards", label: "Cards", count: copiesIn(deckCards) },
    ...byType.map((group) => ({ id: typeAnchor(group.type), label: group.type, count: copiesIn(group.picks), sub: true })),
    { id: "edit-odds", label: "Draw odds" },
    { id: "edit-related", label: "Tokens and related" },
    { id: "edit-recommendations", label: "Recommendations" },
  ];
  const tile = (line: DeckLine) => (
    <DeckTile
      key={line.card.name}
      line={line}
      printing={printingOf(line.card.name)}
      onPick={source.setPrinting && (() => setPickingFor(line.card))}
      onQty={(qty) => source.addList([{ name: line.card.name, qty }])}
      onRemove={() => source.remove(line.card.name)}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[10.5rem_minmax(0,1fr)] lg:gap-8">
      <SectionTabs jumps={jumps} />
      <div className="flex min-w-0 flex-col gap-12">
        <section id="edit-curve" className={ANCHOR}>
          <h3 className="font-semibold">Mana curve</h3>
          <p className="mb-6 text-xs text-muted">
            Spells by mana value, against {data?.curveCounts ? "the average deck for this commander on EDHREC" : "a low, wide curve"}. Click a cost to see your cards at it. {curveAdvice(profile.curve)}
          </p>
          <CurveChart curve={curve} picked={costPick} onPick={(slot) => setCostPick(slot === costPick ? undefined : slot)} />
          {costPick !== undefined && (
            <div className="reveal-fast mt-6">
              <p className="mb-3 text-sm font-semibold">
                Your cards at {CURVE_LABELS[costPick]} mana <span className="font-normal text-muted tabular-nums">({formatCount(atCost.length)})</span>
                <button type="button" onClick={() => setCostPick(undefined)} className="link ml-3 text-xs font-normal text-muted">
                  Hide
                </button>
              </p>
              {atCost.length > 0 ? <ul className={GALLERY}>{[...atCost].sort((a, b) => a.card.name.localeCompare(b.card.name)).map(tile)}</ul> : <p className="text-sm text-muted">No spells at this cost.</p>}
            </div>
          )}
        </section>

        <ColorSection id="edit-colors" className={ANCHOR} source={source} commander={commander?.name} deckCards={deckCards} identity={identity} lands={fixingLands} landTarget={profile.curve.lands.count} spellCuts={spellCuts} />

        <section id="edit-cards" className={`flex flex-col gap-6 ${ANCHOR}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="min-w-0 flex-1 basis-64">
              <h3 className="font-semibold">Cards</h3>
              <p className="text-xs text-muted">{source.setPrinting ? "Select Version picks a card’s set, its Showcase, Borderless or Retro Frame art, or a promo." : "Save this deck to My Decks to select versions of its cards."}</p>
            </div>
            <AddCard identity={identity} inDeck={inDeck} onAdd={source.add} />
          </div>
          {byType.map((group) => (
            <div key={group.type} id={typeAnchor(group.type)} className={ANCHOR}>
              <h4 className="mb-3 text-sm font-semibold">
                {group.type} <span className="font-normal text-muted tabular-nums">({formatCount(copiesIn(group.picks))})</span>
              </h4>
              <ul className={GALLERY}>{[...group.picks].sort((a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name)).map(tile)}</ul>
            </div>
          ))}
        </section>

        <section id="edit-odds" className={ANCHOR}>
          <h3 className="font-semibold">Draw odds</h3>
          <p className="mb-4 text-xs text-muted">The chance of drawing what you need, from the cards in this deck. Opening hands are 7 cards, and you draw one a turn after your first.</p>
          <OddsCalculator deckCards={deckCards} profile={profile} commander={commander?.name} />
        </section>

        <RelatedSection names={deckCards.map((d) => d.card.name)} inDeck={inDeck} />

        <section id="edit-recommendations" className={`flex flex-col gap-6 ${ANCHOR}`}>
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
      </div>

      {pickingFor && source.setPrinting && (
        <PrintingPicker key={pickingFor.name} card={pickingFor} chosen={printingOf(pickingFor.name)} onChoose={(printing) => source.setPrinting!(pickingFor.name, printing)} onClose={() => setPickingFor(null)} />
      )}
    </div>
  );
}

/** The part of the page being read: the last whose top has reached this far down the window, just below where the side tabs jump to. */
const READING_LINE = 128;

function useActiveSection(ids: string[]): [string, (id: string) => void] {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join(" ");
  useEffect(() => {
    const list = key.split(" ");
    let frame = 0;
    const read = () => {
      frame = 0;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const passed = list.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= READING_LINE);
      setActive(atEnd ? list[list.length - 1] : (passed.at(-1) ?? list[0]));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [key]);
  return [active, setActive];
}

/** Tabs down the left of the page, or along the top on a phone, that jump to each part of it and show where you are. */
function SectionTabs({ jumps }: { jumps: Jump[] }) {
  const [active, setActive] = useActiveSection(jumps.map((j) => j.id));
  const list = useRef<HTMLUListElement>(null);

  // Along the top the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    const strip = list.current;
    const current = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (strip && current && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <nav aria-label="Parts of this page" className="sticky top-14 z-20 -mx-4 bg-background/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-20 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <ul ref={list} className="no-scrollbar relative flex gap-1 overflow-x-auto lg:max-h-[calc(100dvh-6rem)] lg:flex-col lg:gap-0.5 lg:overflow-x-visible lg:overflow-y-auto">
        {jumps.map((jump) => {
          const on = active === jump.id;
          return (
            <li key={jump.id} className={jump.sub ? "hidden shrink-0 lg:block" : "shrink-0"}>
              <button
                type="button"
                onClick={() => go(jump.id)}
                aria-current={on ? "true" : undefined}
                className={`flex w-full items-baseline justify-between gap-2 rounded-full px-3 py-1.5 text-left whitespace-nowrap transition-colors duration-150 lg:rounded-lg ${jump.sub ? "text-xs lg:pl-6" : "text-sm"} ${on ? "bg-accent/15 font-medium text-accent" : "text-muted hover:text-foreground"}`}
              >
                {jump.label}
                {jump.count !== undefined && <span className="text-[11px] tabular-nums opacity-60">{formatCount(jump.count)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A card of the deck, in its chosen version, with what you can do to it. */
function DeckTile({ line, printing, onPick, onQty, onRemove }: { line: DeckLine; printing?: ChosenPrinting; onPick?: () => void; onQty: (qty: number) => void; onRemove: () => void }) {
  const { card, qty } = line;
  const steps = qty > 1 || /\bBasic\b/.test(card.typeLine);
  const { trigger, preview } = useHoverPreview(card.name, { imageUrl: printing?.imageUrl });
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div {...trigger} tabIndex={0} className="min-w-0 rounded-[4.75%] outline-offset-4">
        <div className="relative aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle">
          <LazyCardImage url={printing?.imageUrl ?? card.imageUrl} alt={card.name} />
          <GameChangerTag name={card.name} className="absolute top-1.5 left-1.5 shadow" />
          {qty > 1 && <span className="absolute top-1.5 right-1.5 rounded-full bg-background/85 px-1.5 text-xs font-semibold text-white tabular-nums">×{qty}</span>}
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium">
          <span className="truncate" title={card.name}>
            {card.name}
          </span>
          {card.manaCost && <ManaCost cost={card.manaCost.split(" // ")[0]} />}
        </p>
        {printing && (
          <p className="truncate text-[11px] text-accent" title={`${printing.setName} #${printing.collectorNumber}`}>
            {printing.setName}
          </p>
        )}
      </div>
      {preview}
      <div className="mt-auto flex flex-wrap items-center gap-1">
        {steps && (
          <span className="flex w-full items-center justify-between rounded-md border border-line">
            <button type="button" onClick={() => (qty > 1 ? onQty(qty - 1) : onRemove())} aria-label={`One fewer ${card.name}`} className="flex h-6 w-7 items-center justify-center text-muted hover:text-foreground">
              −
            </button>
            <span className="text-xs tabular-nums">{qty}</span>
            <button type="button" onClick={() => onQty(qty + 1)} aria-label={`One more ${card.name}`} className="flex h-6 w-7 items-center justify-center text-muted hover:text-foreground">
              +
            </button>
          </span>
        )}
        {onPick && (
          <button
            type="button"
            onClick={onPick}
            aria-label={`Select a version of ${card.name}`}
            className={`h-6 min-w-0 flex-1 truncate rounded-md border px-1.5 text-[11px] transition-colors ${printing ? "border-accent/50 text-accent" : "border-line text-muted hover:border-line-strong hover:text-foreground"}`}
          >
            Select Version
          </button>
        )}
        <button type="button" onClick={onRemove} aria-label={`Remove ${card.name}`} className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-foreground">
          ×
        </button>
      </div>
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
            <FoundCard
              key={card.name}
              card={card}
              onAdd={() => {
                onAdd(card);
                setQuery("");
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FoundCard({ card, onAdd }: { card: CardDetails; onAdd: () => void }) {
  const { trigger, preview } = useHoverPreview(card.name);
  return (
    <li>
      <button
        type="button"
        {...trigger}
        onClick={() => {
          trigger.onClick();
          onAdd();
        }}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-subtle"
      >
        <span className="min-w-0 truncate">{card.name}</span>
        {card.manaCost && <ManaCost cost={card.manaCost.split(" // ")[0]} />}
      </button>
      {preview}
    </li>
  );
}

/** The tokens, emblems, game pieces and partners the deck's cards bring. */
function RelatedSection({ names, inDeck }: { names: string[]; inDeck: (name: string) => boolean }) {
  const state = useDeckRelated(names);
  const related = state?.state === "done" ? state.result : undefined;
  const empty = related && related.tokens.length + related.emblems.length + related.pieces.length + related.pairs.length === 0;
  return (
    <section id="edit-related" className={`flex flex-col gap-5 ${ANCHOR}`}>
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
                    <HoverName name={pair.to.split(" // ")[0]} look={{ imageUrl: pair.imageUrl }} className="min-w-0 truncate rounded-sm font-medium hover:text-accent" />
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
      <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-5">
        {cards.map((card) => (
          <RelatedTile key={[card.name, card.stats, card.text].join("|")} card={card} />
        ))}
      </ul>
    </div>
  );
}

function RelatedTile({ card }: { card: RelatedCard }) {
  const maker = card.from.length === 1 ? card.from[0] : `${formatCount(card.from.length)} of your cards`;
  const typeLine = card.stats ? `${card.typeLine} · ${card.stats}` : card.typeLine;
  const { trigger, preview } = useHoverPreview(card.name, { imageUrl: card.imageUrl, piece: { typeLine, text: card.text, note: `From ${card.from.join(", ")}` } });
  return (
    <li className="min-w-0">
      <div {...trigger} tabIndex={0} className="rounded-[4.75%] outline-offset-4">
        <span className="block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle">
          <LazyCardImage url={card.imageUrl} alt={card.name} />
        </span>
        <p className="mt-1 truncate text-xs font-medium" title={card.name}>
          {card.stats && <span className="tabular-nums">{card.stats} </span>}
          {card.name}
        </p>
        <p className="truncate text-[11px] text-muted" title={card.from.join(", ")}>
          {maker}
        </p>
      </div>
      {preview}
    </li>
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
      <ul className={GALLERY}>
        <AnimatePresence mode="popLayout" initial={false}>
          {picks.map((p, i) => (
            <BuildCard key={p.card.name} card={p.card} ownedCopies={owned(p.card.name)} categories={p.categories} reason={p.reason} index={i} flies={false} onAdd={onAdd} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
