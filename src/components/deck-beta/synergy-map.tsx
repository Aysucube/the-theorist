"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cardKey, pairingsInDeck, recommend, type Recommendation } from "@/lib/deck-beta/recommend";
import { requestPairings, usePairings } from "@/lib/deck-beta/store";
import { interactionsOf, tagLabel, type DeckAnalysis, type TagLinks } from "@/lib/deck-beta/synergy";
import { formatCount, formatPercent } from "@/lib/format";
import { combosWith } from "@/lib/deck-beta/combos";
import type { CardDetails, Combo, DeckCombos } from "@/lib/types";
import { GameChangerTag } from "../game-changer-tag";
import { ColorIdentity, ManaCost } from "../mana";
import { RetryingImage } from "../retrying-image";
import { useHoverPreview } from "../card-link";
import { BetaRulings } from "./beta-rulings";
import { CardNetwork } from "./card-network";
import { CombosList, type DeckForOdds } from "./combos-panel";
import { formatLift, HoverName, LinkRow, MiniGallery, pairingsMessage, TagName, type CardLookup } from "./bits";
import { LazyCardImage } from "./lazy-card-image";

/** Recommendations shown before "Show more". */
const FIRST_RECOMMENDATIONS = 25;

/**
 * The card profile (double-click): an animated network of the card's
 * synergies and combos with the chosen commander, or a breakdown flowchart
 * (cards that help it → the card → cards it helps) with EDHREC's "played
 * together" cards, plus a sidebar with its rulings and recommendations that
 * aren't in the deck yet, the deck's colors first.
 */
export function SynergyMap({
  initial,
  cards,
  analysis,
  commander,
  combos,
  odds,
  missing,
  onAdd,
  onClose,
}: {
  initial: CardDetails;
  /** The deck's loaded cards. */
  cards: CardDetails[];
  analysis: DeckAnalysis;
  commander?: CardDetails;
  /** The deck's combos, once Commander Spellbook has answered. */
  combos?: DeckCombos | null;
  odds: DeckForOdds;
  missing: Record<string, CardDetails>;
  onAdd: (card: CardDetails) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Cards clicked through, so "Back" can return to the previous one.
  const [trail, setTrail] = useState<string[]>([initial.name]);
  const [tab, setTab] = useState<"map" | "rulings" | "others">("map");
  const [view, setView] = useState<"network" | "breakdown">("network");
  const [walkId, setWalkId] = useState<string | null>(null);
  const graphTop = useRef<HTMLDivElement>(null);
  const walkThrough = (combo: Combo) => {
    setWalkId(combo.id);
    setView("network");
    graphTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // The deck as it was when the map opened: added recommendations stay listed, marked "In deck".
  const [openedWith] = useState(() => cards.map((c) => c.name));

  const byName = new Map(cards.map((c) => [c.name, c]));
  const cardFor = (name: string) => byName.get(name);
  const focus = cards.find((c) => c.name === trail.at(-1)) ?? initial;
  const pairings = usePairings(focus);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const traits = analysis.traits.get(focus.name);
  const links = traits ? interactionsOf(traits, analysis.traits, focus.name) : { uses: [], usedBy: [] };
  const found = pairings?.state === "done" && pairings.result.found ? pairings.result : null;
  const edhrec = found ? pairingsInDeck(found.pairings, [...byName.keys()]).filter((p) => p.name !== focus.name) : [];

  const recommendations = useMemo(
    () =>
      found
        ? recommend({ focus, deck: analysis, deckNames: openedWith, pairings: found.pairings, similar: found.similar, details: found.details })
        : [],
    [found, focus, analysis, openedWith],
  );

  const inDeck = new Set(cards.map((c) => cardKey(c.name)));
  const goTo = (name: string) => {
    if (name !== focus.name) setTrail([...trail, name]);
    setTab("map");
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-label={`Synergy map for ${focus.name}`}
      className="m-auto h-[94vh] max-h-none w-[min(1200px,96vw)] max-w-none overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 backdrop:bg-black/70 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {trail.length > 1 && (
            <button
              type="button"
              onClick={() => setTrail(trail.slice(0, -1))}
              className="rounded-lg border border-zinc-300 px-2.5 py-1 text-sm hover:border-amber-500 dark:border-zinc-700"
            >
              ← Back
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
            Synergy map: <HoverName name={focus.name} />
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-sm hover:border-amber-500 dark:border-zinc-700"
          >
            Close
          </button>
        </header>

        {/* Tabs on small screens; side by side on wide ones. */}
        <div role="tablist" className="flex border-b border-zinc-200 lg:hidden dark:border-zinc-800">
          {(["map", "rulings", "others"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-amber-500" : "text-zinc-500"}`}
            >
              {t === "map" ? "Synergies" : t === "rulings" ? "Rulings" : `Recommendations${found ? ` (${recommendations.length})` : ""}`}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className={`min-h-0 overflow-y-auto p-4 sm:p-6 ${tab === "map" ? "" : "hidden lg:block"}`}>
            <div role="tablist" aria-label="View" className="mb-4 flex gap-2">
              {(["network", "breakdown"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium ${
                    view === v ? "border-amber-500 bg-amber-500 text-zinc-950" : "border-zinc-300 hover:border-amber-500 dark:border-zinc-700"
                  }`}
                >
                  {v === "network" ? "Network" : "Breakdown"}
                </button>
              ))}
            </div>

            {view === "network" ? (
              <>
                <div ref={graphTop} className="scroll-mt-4">
                  <CardNetwork
                    focus={focus}
                    commander={commander}
                    analysis={analysis}
                    deckNames={[...byName.keys()]}
                    details={byName}
                    combos={combos}
                    pairings={found?.pairings}
                    missing={missing}
                    walkId={walkId}
                    onWalk={setWalkId}
                    inDeck={(name) => inDeck.has(cardKey(name))}
                    onAdd={onAdd}
                    onOpen={goTo}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Lines from the middle are this card’s strongest synergies in your deck (blue: subtypes, violet: themes,
                  gray: card types). Coloured chains are combos: each runs from this card through the other pieces to what
                  the combo does (a diamond: click it to walk through the combo); dashed chains and shaded cards are a card
                  away. Click a card to select it, double-click to re-centre on it; drag to move, Ctrl + scroll to zoom.
                </p>
                <section className="mt-6">
                  <h3 className="mb-2 font-semibold">Combos with {focus.name}</h3>
                  {combos === undefined ? (
                    <p className="text-sm text-zinc-500">Loading combos from Commander Spellbook…</p>
                  ) : combos === null ? (
                    <p className="text-sm text-zinc-500">Couldn’t reach Commander Spellbook for combos.</p>
                  ) : combosWith(combos.included, focus.name).length + combosWith([...combos.almostIncluded, ...(combos.wider ?? [])], focus.name).length === 0 ? (
                    <p className="text-sm text-zinc-500">
                      No known combo uses {focus.name} with {commander ? `${commander.name} and ` : ""}your deck.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <CombosList combos={combosWith(combos.included, focus.name)} deck={odds} onOpen={goTo} onWalk={walkThrough} />
                      <CombosList
                        combos={combosWith([...combos.almostIncluded, ...(combos.wider ?? [])], focus.name)}
                        deck={odds}
                        missing={missing}
                        inDeck={(name) => inDeck.has(cardKey(name))}
                        onAdd={onAdd}
                        onOpen={goTo}
                        onWalk={walkThrough}
                        colorOffset={combosWith(combos.included, focus.name).length}
                      />
                    </div>
                  )}
                </section>
              </>
            ) : (
              <Flowchart focus={focus} uses={links.uses} usedBy={links.usedBy} cardFor={cardFor} onCard={goTo} />
            )}

            <section className="mt-8">
              <h3 className="font-semibold">EDHREC: often played with {focus.name}</h3>
              {pairingsMessage(pairings) ? (
                <PairingsStatus message={pairingsMessage(pairings)!} focus={focus} failed={pairings?.state === "error"} />
              ) : (
                <>
                  <p className="mt-1 mb-2 text-sm text-zinc-500">
                    {edhrec.length > 0
                      ? "Your cards that EDHREC decks run with it more often than usual (× how much more often)."
                      : found
                        ? "None of your other cards stand out as EDHREC partners for it."
                        : "EDHREC has no page for this card."}
                  </p>
                  {edhrec.length > 0 && (
                    <MiniGallery
                      label={`Played with ${focus.name} on EDHREC`}
                      items={edhrec.map((p) => ({ name: p.name, note: formatLift(p.lift) }))}
                      cardFor={cardFor}
                      onCard={goTo}
                      hoverPreview
                    />
                  )}
                  {found && (
                    <a href={found.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-amber-700 hover:underline dark:text-amber-400">
                      View on EDHREC ↗
                    </a>
                  )}
                </>
              )}
            </section>
          </div>

          <aside
            className={`min-h-0 overflow-y-auto border-zinc-200 bg-zinc-50 p-4 lg:border-l dark:border-zinc-800 dark:bg-zinc-900/60 ${
              tab === "map" ? "hidden lg:block" : ""
            }`}
          >
            {/* Phones show one section per tab; wide screens show both. */}
            <section className={`mb-6 ${tab === "rulings" ? "" : "hidden lg:block"}`}>
              <h3 className="mb-2 font-semibold">
                Rulings: <HoverName name={focus.name} />
              </h3>
              <BetaRulings key={focus.name} card={focus} />
            </section>

            <section className={tab === "others" ? "" : "hidden lg:block"}>
              <h3 className="font-semibold">Other recommendations</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Not in your deck: cards EDHREC decks play with {focus.name}, and cards that do a similar job.{" "}
                {analysis.colors.length > 0 ? (
                  <>
                    Cards in your colors (<ColorIdentity colors={analysis.colors} />) come first.
                  </>
                ) : (
                  "Your deck is colorless, so colorless cards come first."
                )}
              </p>
              {pairingsMessage(pairings) ? (
                <PairingsStatus message={pairingsMessage(pairings)!} focus={focus} failed={pairings?.state === "error"} />
              ) : (
                <RecommendationList recommendations={recommendations} inDeck={inDeck} onAdd={onAdd} />
              )}
            </section>
          </aside>
        </div>
      </div>
    </dialog>
  );
}

function PairingsStatus({ message, focus, failed }: { message: string; focus: CardDetails; failed: boolean }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
      {!failed && (
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500 dark:border-zinc-600 dark:border-t-amber-400" />
      )}
      {message}
      {failed && (
        <button type="button" onClick={() => requestPairings(focus)} className="text-amber-700 underline dark:text-amber-400">
          Try again
        </button>
      )}
    </p>
  );
}

/** Cards that help the focus card → the focus card → cards it helps. */
function Flowchart({
  focus,
  uses,
  usedBy,
  cardFor,
  onCard,
}: {
  focus: CardDetails;
  uses: TagLinks[];
  usedBy: TagLinks[];
  cardFor: CardLookup;
  onCard: (name: string) => void;
}) {
  return (
    <div className="grid items-center gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-0">
      <Branch title={`Helps ${focus.name}`} empty="No cards in your deck feed it." links={uses} side="left" cardFor={cardFor} onCard={onCard} />

      <div className="flex flex-col items-center xl:flex-row">
        <Connector />
        <FocusCard card={focus} />
        <Connector />
      </div>

      <Branch title={`${focus.name} helps`} empty="No cards in your deck reward it." links={usedBy} side="right" cardFor={cardFor} onCard={onCard} />
    </div>
  );
}

/** The card the map is about, in the middle; resting the mouse on it shows its hover preview. */
function FocusCard({ card }: { card: CardDetails }) {
  const { trigger, preview } = useHoverPreview(card.name);
  return (
    <>
      <div {...trigger} className="w-40 shrink-0 rounded-xl border-2 border-amber-500 bg-white p-2 shadow-lg dark:bg-zinc-900">
        <div className="aspect-[488/680] overflow-hidden rounded-[4.75%] bg-zinc-200 dark:bg-zinc-800">
          {card.imageUrl && <RetryingImage url={card.imageUrl} alt={card.name} />}
        </div>
        <p className="mt-1.5 text-center text-xs font-semibold">{card.name}</p>
        <p className="text-center">
          <GameChangerTag name={card.name} />
        </p>
      </div>
      {preview}
    </>
  );
}

/** An arrow between the columns: down on narrower screens, right on wide ones. */
function Connector() {
  return (
    <span aria-hidden className="flex items-center justify-center text-zinc-400 dark:text-zinc-600">
      <span className="xl:hidden">↓</span>
      <span className="hidden items-center xl:flex">
        <span className="h-0.5 w-6 bg-current" />▶
      </span>
    </span>
  );
}

function Branch({
  title,
  empty,
  links,
  side,
  cardFor,
  onCard,
}: {
  title: string;
  empty: string;
  links: TagLinks[];
  side: "left" | "right";
  cardFor: CardLookup;
  onCard: (name: string) => void;
}) {
  const trunk = side === "left" ? "xl:border-r-2 xl:pr-6" : "xl:border-l-2 xl:pl-6";
  const twig = side === "left" ? "-right-6" : "-left-6";
  return (
    <div className="min-w-0">
      <h3 className={`mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 ${side === "left" ? "xl:pr-6 xl:text-right" : "xl:pl-6"}`}>
        {title}
      </h3>
      {links.length === 0 ? (
        <p className={`text-sm text-zinc-500 ${side === "left" ? "xl:pr-6 xl:text-right" : "xl:pl-6"}`}>{empty}</p>
      ) : (
        <ul className={`flex flex-col gap-3 border-zinc-300 dark:border-zinc-700 ${trunk}`}>
          {links.map((link) => (
            <li key={link.tag} className="relative">
              <span aria-hidden className={`absolute top-5 hidden h-0.5 w-6 bg-zinc-300 xl:block dark:bg-zinc-700 ${twig}`} />
              <ul className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900" aria-label={tagLabel(link.tag)}>
                <LinkRow link={link} cardFor={cardFor} onCard={onCard} hoverPreview />
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecommendationList({
  recommendations,
  inDeck,
  onAdd,
}: {
  recommendations: Recommendation[];
  inDeck: Set<string>;
  onAdd: (card: CardDetails) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const inColors = recommendations.filter((r) => r.inColors);
  const outside = recommendations.filter((r) => !r.inColors);
  const shown = showAll ? inColors : inColors.slice(0, FIRST_RECOMMENDATIONS);

  if (recommendations.length === 0) {
    return <p className="mt-3 text-sm text-zinc-500">Nothing to add: EDHREC’s picks for it are already in your deck.</p>;
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {inColors.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <RecommendationRow key={r.card.name} rec={r} added={inDeck.has(cardKey(r.card.name))} onAdd={onAdd} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">None of EDHREC’s picks fit your deck’s colors.</p>
      )}
      {inColors.length > shown.length && (
        <button type="button" onClick={() => setShowAll(true)} className="self-start text-sm text-amber-700 hover:underline dark:text-amber-400">
          Show {formatCount(inColors.length - shown.length)} more
        </button>
      )}
      {outside.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Outside your colors ({formatCount(outside.length)})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {outside.slice(0, FIRST_RECOMMENDATIONS).map((r) => (
              <RecommendationRow key={r.card.name} rec={r} added={inDeck.has(cardKey(r.card.name))} onAdd={onAdd} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RecommendationRow({ rec, added, onAdd }: { rec: Recommendation; added: boolean; onAdd: (card: CardDetails) => void }) {
  const { card } = rec;
  // Resting the mouse on the picture or the name shows the card's hover preview.
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
        <p className="truncate text-xs text-zinc-500">{card.typeLine}</p>
        <div className="flex flex-wrap items-center gap-1">
          {rec.withFocus.slice(0, 3).map((tag) => (
            <TagName key={tag} tag={tag} />
          ))}
          {rec.similar && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-300">Similar job</span>}
          {rec.pairing && (
            <span
              className="text-xs text-zinc-500 tabular-nums"
              title="EDHREC: the share of this card's decks that play it, and how many times more often than decks overall"
            >
              EDHREC {formatPercent(rec.pairing.inclusion ?? 0)} · {formatLift(rec.pairing.lift)}
            </span>
          )}
          {rec.deckPartners > 0 && (
            <span className="text-xs text-zinc-500">
              · works with {formatCount(rec.deckPartners)} of your cards
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={added}
        onClick={() => onAdd(card)}
        aria-label={added ? `${card.name} is in your deck` : `Add ${card.name} to deck`}
        className={`h-8 shrink-0 self-center rounded-lg px-2.5 text-xs font-medium ${
          added
            ? "border border-emerald-600 text-emerald-700 dark:text-emerald-400"
            : "bg-amber-500 text-zinc-950 hover:bg-amber-400"
        }`}
      >
        {added ? "In deck ✓" : "+ Add"}
      </button>
    </li>
  );
}
