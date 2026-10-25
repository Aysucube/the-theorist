"use client";

import { useMemo, useState } from "react";
import type { PlaystyleCard } from "@/lib/deck-beta/api";
import { looseCards, type Hub } from "@/lib/deck-beta/playstyle";
import { cardKey } from "@/lib/deck-beta/recommend";
import { requestPlaystyle, usePlaystyle } from "@/lib/deck-beta/store";
import { parseTypeLine, tagLabel, type DeckAnalysis } from "@/lib/deck-beta/synergy";
import { formatCount, formatPercent } from "@/lib/format";
import type { CardDetails, EdhrecTheme } from "@/lib/types";
import { useHoverPreview } from "../card-link";
import { GameChangerTag } from "../game-changer-tag";
import { ManaCost } from "../mana";
import { HUB_COLORS } from "./deck-network";
import { LazyCardImage } from "./lazy-card-image";

/** Recommendations shown for a playstyle. */
const SHOWN = 24;

/**
 * The deck's playstyle now (its hubs), and how to lean into one of the
 * commander's playstyles: EDHREC's best cards for it that the deck lacks, and
 * deck cards those decks rarely play.
 */
export function PlaystylePanel({
  commander,
  themes,
  commanderUrl,
  hubs,
  analysis,
  cards,
  inDeck,
  onAdd,
  onOpen,
}: {
  commander: CardDetails;
  themes: EdhrecTheme[];
  commanderUrl?: string;
  hubs: Hub[];
  analysis: DeckAnalysis;
  cards: CardDetails[];
  inDeck: (name: string) => boolean;
  onAdd: (card: CardDetails) => void;
  onOpen: (name: string) => void;
}) {
  const [theme, setTheme] = useState<string | undefined>(themes[0]?.slug);
  const state = usePlaystyle(commander, theme);
  const chosen = themes.find((t) => t.slug === theme);
  const found = state?.state === "done" && state.result.found ? state.result : null;

  // Recommendations are frozen when the playstyle loads, so added cards stay listed (as "In deck").
  const recommendations = useMemo(() => {
    if (!found) return [];
    return found.cards.filter((c) => found.details[c.name] && !inDeck(c.name)).slice(0, SHOWN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  const offPlan = useMemo(() => {
    if (!found) return [];
    const listed = new Set(found.listed.map(cardKey));
    return cards
      .filter((c) => c.name !== commander.name && !parseTypeLine(c.typeLine).types.has("Land") && !listed.has(cardKey(c.name)))
      .map((c) => c.name)
      .sort();
  }, [found, cards, commander]);

  const loose = useMemo(
    () => looseCards(analysis, (name) => name === commander.name || parseTypeLine(cards.find((c) => c.name === name)?.typeLine ?? "").types.has("Land")),
    [analysis, cards, commander],
  );

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="font-semibold">What your deck is built around now</h3>
        <p className="mb-3 text-xs text-muted">
          Read from your cards’ rules text: payoffs reward a theme, enablers are or make it.
        </p>
        {hubs.length === 0 ? (
          <p className="text-sm text-muted">No theme stands out yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {hubs.map((hub, i) => (
              <li key={hub.tag} className="rounded-lg border border-line p-3">
                <p className="flex items-center gap-2 font-medium">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: HUB_COLORS[i % HUB_COLORS.length] }} />
                  {tagLabel(hub.tag)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatCount(hub.payoffs.length)} payoffs ({hub.payoffs.slice(0, 3).join(", ")}
                  {hub.payoffs.length > 3 ? "…" : ""}) · {formatCount(hub.enablers.length)} enablers
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-semibold">Maximize a playstyle for {commander.name}</h3>
        {themes.length === 0 ? (
          <p className="mt-1 text-sm text-muted">EDHREC doesn’t list playstyles for this commander.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              The ways EDHREC players build this commander, with how many decks do. Pick one for the cards that suit it
              best that your deck doesn’t have yet.
            </p>
            <div role="tablist" aria-label="Playstyle" className="flex flex-wrap gap-2">
              {themes.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  role="tab"
                  aria-selected={t.slug === theme}
                  onClick={() => setTheme(t.slug)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                    t.slug === theme ? "border-accent bg-accent text-on-accent shadow-[0_0_16px_-4px_rgb(90_176_255/0.6)]" : "border-line-strong hover:border-accent/50 "
                  }`}
                >
                  {t.name}
                  <span className={`text-xs tabular-nums ${t.slug === theme ? "text-on-accent/70" : "text-muted"}`}>{formatCount(t.numDecks)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {theme && (
        <section key={theme} className="reveal-fast flex flex-col gap-4">
          {!state || state.state === "loading" || state.state === "waiting" ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <span aria-hidden className="size-4 spinner" />
              {state?.state === "waiting" ? `Waiting ${state.seconds}s because ${state.reason}, then trying again…` : "Loading EDHREC’s picks…"}
            </p>
          ) : state.state === "error" ? (
            <p className="text-sm text-muted">
              Couldn’t reach EDHREC after several tries.{" "}
              <button type="button" onClick={() => requestPlaystyle(commander, theme, true)} className="link">
                Try again
              </button>
            </p>
          ) : !found ? (
            <p className="text-sm text-muted">EDHREC has no page for this playstyle.</p>
          ) : (
            <>
              <div>
                <h4 className="font-medium">Add for {chosen?.name ?? "this playstyle"}</h4>
                <p className="mb-2 text-xs text-muted">
                  EDHREC’s highest-synergy cards for {commander.name} {chosen?.name} decks that you don’t run.{" "}
                  <a href={found.url} target="_blank" rel="noopener noreferrer" className="link">
                    View on EDHREC ↗
                  </a>
                </p>
                {recommendations.length === 0 ? (
                  <p className="text-sm text-muted">You already run all of EDHREC’s top picks for it.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {recommendations.map((c) => (
                      <PickRow key={c.name} pick={c} card={found.details[c.name]} added={inDeck(c.name)} onAdd={onAdd} />
                    ))}
                  </ul>
                )}
              </div>
              {offPlan.length > 0 && (
                <div>
                  <h4 className="font-medium">Your cards these decks rarely play</h4>
                  <p className="mb-2 text-xs text-muted">
                    Not in EDHREC’s lists for this playstyle, so worth a look if you need room. Lands aren’t counted.
                  </p>
                  <NameList names={offPlan} onOpen={onOpen} />
                </div>
              )}
            </>
          )}
          {commanderUrl && !found && (
            <a href={commanderUrl} target="_blank" rel="noopener noreferrer" className="text-sm link">
              {commander.name} on EDHREC ↗
            </a>
          )}
        </section>
      )}

      {loose.length > 0 && (
        <section>
          <h3 className="font-semibold">Cards that don’t link to anything</h3>
          <p className="mb-2 text-xs text-muted">
            Nothing in their rules text works with the rest of your deck. Removal and ramp often land here and still earn
            their slot; the rest are the first places to look for cuts.
          </p>
          <NameList names={loose} onOpen={onOpen} />
        </section>
      )}
    </div>
  );
}

function PickRow({ pick, card, added, onAdd }: { pick: PlaystyleCard; card: CardDetails; added: boolean; onAdd: (card: CardDetails) => void }) {
  const { trigger, preview } = useHoverPreview(card.name);
  return (
    <li className="flex gap-2.5 rounded-lg border border-line bg-background p-2">
      <div {...trigger} className="aspect-[488/680] w-12 shrink-0 overflow-hidden rounded-[4.75%] bg-subtle">
        <LazyCardImage url={card.imageUrl} alt={card.name} />
      </div>
      {preview}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start gap-1.5">
          <p {...trigger} className="min-w-0 flex-1 text-sm leading-tight font-medium">
            {card.name}
            <GameChangerTag name={card.name} className="ml-1.5" />
          </p>
          {card.manaCost && <ManaCost cost={card.manaCost.split(" // ")[0]} />}
        </div>
        <p className="truncate text-xs text-muted">{card.typeLine}</p>
        <p className="text-xs tabular-nums">
          {pick.synergy !== undefined && (
            <span className={pick.synergy >= 0 ? "text-emerald-600" : "text-red-600"}>
              {pick.synergy >= 0 ? "+" : ""}
              {formatPercent(pick.synergy)} synergy
            </span>
          )}
          {pick.inclusion !== undefined && <span className="text-muted"> · in {formatPercent(pick.inclusion)} of these decks</span>}
        </p>
      </div>
      <button
        type="button"
        disabled={added}
        onClick={() => onAdd(card)}
        aria-label={added ? `${card.name} is in your deck` : `Add ${card.name} to deck`}
        className={`h-8 shrink-0 self-center rounded-lg px-2.5 text-xs font-medium ${
          added ? "border border-emerald-600 text-emerald-700 dark:text-emerald-400" : "btn-primary"
        }`}
      >
        {added ? "In deck ✓" : "+ Add"}
      </button>
    </li>
  );
}

function NameList({ names, onOpen }: { names: string[]; onOpen: (name: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onOpen(name)}
          className="rounded-md border border-line bg-background px-2 py-0.5 text-xs hover:border-accent/50"
        >
          {name}
        </button>
      ))}
    </div>
  );
}
