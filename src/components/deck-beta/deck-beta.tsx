"use client";

import { useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { parseDeckList, MAX_DECK_CARDS } from "@/lib/deck";
import type { AnalysisResponse } from "@/lib/deck-beta/api";
import { estimateDeckBracket } from "@/lib/deck-beta/bracket";
import { commanderOptions } from "@/lib/deck-beta/combos";
import { decodeDeck, isDeckCode } from "@/lib/deck-beta/deck-code";
import { deckHubs } from "@/lib/deck-beta/playstyle";
import { cardKey } from "@/lib/deck-beta/recommend";
import { deckProfile } from "@/lib/deck-beta/roles";
import { analyzeDeck, parseTypeLine } from "@/lib/deck-beta/synergy";
import {
  latestAnalysisFor,
  loadWholeDeck,
  requestAnalysis,
  useBetaDeck,
  useBetaDetails,
  useChosenCommander,
  useDeckAnalysis,
  type LoadStatus,
  type RemoteState,
} from "@/lib/deck-beta/store";
import { formatCount } from "@/lib/format";
import { useGameChangers } from "@/lib/use-game-changers";
import type { CardDetails } from "@/lib/types";
import { GameChangerTag } from "../game-changer-tag";
import { ColorIdentity, ManaCost } from "../mana";
import { ImageNote } from "../retrying-image";
import { AddToShopping } from "./add-to-shopping";
import { BracketBadge } from "./bracket-badge";
import { CombosPanel, type DeckForOdds } from "./combos-panel";
import { DeckLibrary, SharedDeckBanner } from "./deck-library";
import { DeckNetwork } from "./deck-network";
import { InteractionsPopover } from "./interactions-popover";
import { LazyCardImage } from "./lazy-card-image";
import { PlaystylePanel } from "./playstyle-panel";
import { RecommendationsPanel } from "./recommendations-panel";
import { SynergyMap } from "./synergy-map";

/** One line of the deck: the name as pasted, and Scryfall's details once loaded. */
export interface Entry {
  asked: string;
  qty: number;
  /** undefined while loading; null when Scryfall doesn't know the name. */
  details: CardDetails | null | undefined;
}

const GROUPS = ["Creatures", "Planeswalkers", "Battles", "Instants", "Sorceries", "Artifacts", "Enchantments", "Lands", "Other"];

function groupOf(card: CardDetails): string {
  const { types } = parseTypeLine(card.typeLine);
  if (types.has("Land")) return "Lands";
  if (types.has("Creature")) return "Creatures";
  if (types.has("Planeswalker")) return "Planeswalkers";
  if (types.has("Battle")) return "Battles";
  if (types.has("Instant")) return "Instants";
  if (types.has("Sorcery")) return "Sorceries";
  if (types.has("Artifact")) return "Artifacts";
  if (types.has("Enchantment")) return "Enchantments";
  return "Other";
}

/** Waits this long after a click for a second one, so a double-click doesn't flash the preview. */
const DOUBLE_CLICK_MS = 250;

type View = "network" | "recommend" | "combos" | "playstyle" | "cards";
const VIEWS: { id: View; label: string }[] = [
  { id: "network", label: "Network" },
  { id: "recommend", label: "Recommendations" },
  { id: "combos", label: "Combos" },
  { id: "playstyle", label: "Playstyle" },
  { id: "cards", label: "Cards" },
];

/**
 * Deck Synergy (beta): paste a deck and pick its commander to see the deck as
 * an animated network of playstyles, synergies and combos, how consistently it
 * assembles those combos, and what to add to lean into one of the commander's
 * playstyles, and recommendations built from what the deck has (Quadrant
 * Theory, ramp, consistency, combos, the bracket to build toward), with the
 * deck's own bracket by its title. Decks can be saved and shared as codes, and
 * copied into Shopping.
 * Click a card for what it interacts with; double-click (or click
 * it in the network) for its own network. Kept apart from the rest of the app:
 * its deck and data are its own, and it only touches Shopping when asked to.
 */
export function DeckBeta() {
  const { deck, ready, replace, addList, add, remove, clear } = useBetaDeck();
  const { detailsFor, status } = useBetaDetails(deck);
  const [chosenCommander, setChosenCommander] = useChosenCommander();
  const [view, setView] = useState<View>("network");
  const [walkId, setWalkId] = useState<string | null>(null);
  const commanderSelect = useId();
  const [preview, setPreview] = useState<{ name: string; anchor: DOMRect } | null>(null);
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  const clickTimer = useRef<number | undefined>(undefined);

  const entries: Entry[] = deck.map((c) => ({ asked: c.name, qty: c.qty, details: detailsFor(c.name) }));
  // Each card once, by Scryfall's name.
  const loaded = [...new Map(entries.flatMap((e) => (e.details ? [[e.details.name, e.details] as const] : []))).values()];
  const loadedKey = loaded.map((c) => c.name).join("\n");
  // Recomputed only when the set of loaded cards changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const analysis = useMemo(() => analyzeDeck(loaded), [loadedKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => commanderOptions(loaded, analysis.colors), [loadedKey, analysis]);
  const commander = options.find((c) => c.name === chosenCommander) ?? options[0];
  const deckNames = loaded.map((c) => c.name);
  const remote = useDeckAnalysis(commander, deckNames);
  // While a changed deck is re-analyzed, keep showing the last analysis rather than a loading message.
  const result = remote?.state === "done" ? remote.result : latestAnalysisFor(commander);
  const hubs = useMemo(() => deckHubs(analysis), [analysis]);

  const libraryKey = entries.map((e) => `${e.details?.name}×${e.qty}`).join("\n") + commander?.name;
  const odds: DeckForOdds = useMemo(
    () => ({
      library: entries.flatMap((e) => (e.details && e.details.name !== commander?.name ? Array<string>(e.qty).fill(e.details.name) : [])),
      commander: commander?.name,
      details: new Map(loaded.map((c) => [c.name, c])),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libraryKey],
  );
  // Each card once with its copies, for counting jobs and lands, and what jobs they do.
  const { deckCards, profile } = useMemo(() => {
    const counted = new Map<string, { card: CardDetails; qty: number }>();
    for (const e of entries) {
      if (!e.details) continue;
      const seen = counted.get(e.details.name);
      counted.set(e.details.name, { card: e.details, qty: (seen?.qty ?? 0) + e.qty });
    }
    const cards = [...counted.values()];
    return { deckCards: cards, profile: deckProfile(cards, analysis.colors) };
    // The library key captures the deck's cards and copies (and so its colors).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryKey]);
  const gameChangers = useGameChangers();
  // undefined while Commander Spellbook hasn't answered; null if it couldn't be reached.
  const deckCombos = result ? result.combos : remote?.state === "error" ? null : undefined;
  const report = useMemo(
    () =>
      estimateDeckBracket({
        cards: loaded,
        isGameChanger: gameChangers.has,
        combos: deckCombos,
        spellbook: result?.bracket,
        tutors: profile.roles.tutor.length,
      }),
    // The loaded key captures the deck's cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedKey, commander, gameChangers, deckCombos, result, profile],
  );
  const checking = Boolean(commander) && deckCombos === undefined;
  // Combos a card away, then the wider ones EDHREC lists for the commander.
  const nearCombos = useMemo(() => [...(deckCombos?.almostIncluded ?? []), ...(deckCombos?.wider ?? [])], [deckCombos]);

  if (!ready) return <p className="text-muted">Loading your deck…</p>;

  const totalCards = deck.reduce((sum, c) => sum + c.qty, 0);
  const notFound = entries.filter((e) => e.details === null);
  const pending = entries.filter((e) => e.details === undefined).length;
  const inDeck = (name: string) => loaded.some((c) => cardKey(c.name) === cardKey(name));

  function onTileClick(event: MouseEvent<HTMLButtonElement>, name: string) {
    window.clearTimeout(clickTimer.current);
    if (event.detail >= 2) {
      setPreview(null);
      setMapFocus(name);
      return;
    }
    const anchor = event.currentTarget.getBoundingClientRect();
    // Keyboard "clicks" (detail 0) open at once; mouse clicks wait to see if a second click follows.
    if (event.detail === 0) setPreview({ name, anchor });
    else clickTimer.current = window.setTimeout(() => setPreview({ name, anchor }), DOUBLE_CLICK_MS);
  }

  const openCard = (name: string) => {
    const card = loaded.find((c) => c.name === name || cardKey(c.name) === cardKey(name));
    if (card) setMapFocus(card.name);
  };
  const previewCard = preview ? loaded.find((c) => c.name === preview.name) : undefined;
  const mapCard = mapFocus ? loaded.find((c) => c.name === mapFocus) : undefined;
  const combos = result?.combos;
  const comboCount = combos?.included.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              Deck Synergy
              <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold tracking-normal text-muted uppercase">
                Beta
              </span>
            </h1>
            {loaded.length > 0 && <BracketBadge report={report} checking={checking} onClick={() => setView("recommend")} />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>
              {formatCount(totalCards)} {totalCards === 1 ? "card" : "cards"} · saved in this browser only
            </span>
            {analysis.colors.length > 0 && (
              <span className="inline-flex items-center gap-1">
                · <ColorIdentity colors={analysis.colors} />
              </span>
            )}
          </p>
        </div>
        {deck.length > 0 && (
          <div className="flex items-center gap-2">
            <AddToShopping deck={deck} detailsFor={detailsFor} />
            <ClearButton onClear={clear} />
          </div>
        )}
      </div>

      <p className="text-sm text-muted">
        An early test, kept separate from the rest of the app: this deck isn’t your Shopping list, and nothing here
        changes it unless you click Add to Shopping. Synergies are read from each card’s types and rules text plus EDHREC’s data, combos come from
        Commander Spellbook and EDHREC, so treat them as hints.
      </p>

      <SharedDeckBanner />

      <ImportBox hasDeck={deck.length > 0} onReplace={replace} onAdd={addList} />

      <DeckLibrary deck={deck} commander={commander?.name} />

      {deck.length > 0 && (
        <>
          <StatusLine status={status} pending={pending} />

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
            {options.length > 0 ? (
              <>
                <label htmlFor={commanderSelect} className="text-sm font-medium">
                  Commander
                </label>
                <select
                  id={commanderSelect}
                  value={commander?.name ?? ""}
                  onChange={(e) => setChosenCommander(e.target.value)}
                  className="h-9 min-w-0 max-w-full rounded-lg border border-line-strong bg-background px-2 text-sm"
                >
                  {options.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <AnalysisStatus state={remote} commander={commander} cards={deckNames} />
              </>
            ) : (
              <p className="text-sm text-muted">
                No card in this deck can be a commander yet. Add one (a legendary creature, or a legendary Vehicle or
                Spacecraft) to see combos and playstyles.
              </p>
            )}
          </div>

          <div role="tablist" aria-label="Deck Synergy view" className="flex flex-wrap gap-2 border-b border-line pb-3">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  view === v.id ? "border-foreground bg-foreground text-background" : "border-line-strong hover:border-foreground/30 "
                }`}
              >
                {v.label}
                {v.id === "combos" && comboCount !== undefined && <span className="ml-1 tabular-nums">({formatCount(comboCount)})</span>}
              </button>
            ))}
          </div>

          {view === "network" && (
            <DeckNetwork
              commander={commander}
              cards={loaded}
              analysis={analysis}
              combos={combos?.included ?? []}
              almost={nearCombos}
              missing={result?.missing ?? {}}
              walkId={walkId}
              onWalk={setWalkId}
              inDeck={inDeck}
              onAdd={add}
              onOpen={openCard}
            />
          )}

          {view === "recommend" && (
            <RecommendationsPanel
              commander={commander}
              deckCards={deckCards}
              profile={profile}
              report={report}
              checking={checking}
              analysis={analysis}
              colors={analysis.colors}
              combos={deckCombos}
              odds={odds}
              missing={result?.missing ?? {}}
              inDeck={inDeck}
              onAdd={add}
              onOpen={openCard}
              onWalk={(combo) => {
                setWalkId(combo.id);
                setView("network");
              }}
            />
          )}

          {view === "combos" &&
            (combos ? (
              <CombosPanel
                combos={combos}
                deck={odds}
                missing={result?.missing ?? {}}
                inDeck={inDeck}
                onAdd={add}
                onOpen={openCard}
                onWalk={(combo) => {
                  setWalkId(combo.id);
                  setView("network");
                }}
              />
            ) : (
              <WaitingFor what="combos" commander={commander} state={remote} failed={combos === null} />
            ))}

          {view === "playstyle" &&
            (commander && result ? (
              <PlaystylePanel
                commander={commander}
                themes={result.themes}
                commanderUrl={result.commanderUrl}
                hubs={hubs}
                analysis={analysis}
                cards={loaded}
                inDeck={inDeck}
                onAdd={add}
                onOpen={openCard}
              />
            ) : (
              <WaitingFor what="playstyles" commander={commander} state={remote} />
            ))}

          {view === "cards" && (
            <>
              <p className="text-sm text-muted">
                <strong>Click</strong> a card to see what it interacts with in your deck.{" "}
                <strong>Double-click</strong> it for its network, combos and recommendations.
              </p>
              <Gallery entries={entries} selected={preview?.name ?? mapFocus} onTileClick={onTileClick} />
            </>
          )}

          {notFound.length > 0 && (
            <p className="text-sm text-muted">
              Scryfall doesn’t know {notFound.map((e) => `“${e.asked}”`).join(", ")}. Check the spelling, or remove{" "}
              {notFound.length === 1 ? "it" : "them"}:{" "}
              {notFound.map((e) => (
                <button key={e.asked} type="button" onClick={() => remove(e.asked)} className="mr-2 link">
                  remove {e.asked}
                </button>
              ))}
            </p>
          )}
        </>
      )}

      {preview && previewCard && (
        <InteractionsPopover
          key={previewCard.name}
          card={previewCard}
          anchor={preview.anchor}
          analysis={analysis}
          cards={loaded}
          onClose={() => setPreview(null)}
          onOpenMap={() => {
            setPreview(null);
            setMapFocus(previewCard.name);
          }}
          onRemove={() => {
            const entry = entries.find((e) => e.details?.name === previewCard.name);
            if (entry) remove(entry.asked);
            setPreview(null);
          }}
        />
      )}

      {mapFocus && mapCard && (
        <SynergyMap
          initial={mapCard}
          cards={loaded}
          analysis={analysis}
          commander={commander}
          combos={result ? combos : remote?.state === "error" ? null : undefined}
          odds={odds}
          missing={result?.missing ?? {}}
          onAdd={add}
          onClose={() => setMapFocus(null)}
        />
      )}
    </div>
  );
}

/** How the deck's analysis is going, beside the commander picker. */
function AnalysisStatus({
  state,
  commander,
  cards,
}: {
  state: RemoteState<AnalysisResponse> | undefined;
  commander?: CardDetails;
  cards: string[];
}) {
  if (!commander || !state) return null;
  if (state.state === "done") {
    const combos = state.result.combos;
    return (
      <span className="text-xs text-muted">
        {combos
          ? `${formatCount(combos.included.length)} combos found, ${formatCount(combos.almostIncluded.length)} a card away${
              combos.wider?.length ? `, ${formatCount(combos.wider.length)} more on EDHREC` : ""
            }.`
          : "Couldn’t reach Commander Spellbook for combos."}{" "}
        {(!combos || state.result.themes.length === 0) && (
          <button type="button" onClick={() => requestAnalysis(commander, cards, true)} className="link">
            Try again
          </button>
        )}
      </span>
    );
  }
  if (state.state === "error") {
    return (
      <span className="text-xs text-muted">
        Couldn’t analyze the deck after several tries.{" "}
        <button type="button" onClick={() => requestAnalysis(commander, cards, true)} className="link">
          Try again
        </button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <span aria-hidden className="size-3.5 spinner" />
      {state.state === "waiting"
        ? `Waiting ${state.seconds}s because ${state.reason}, then trying again…`
        : "Finding combos and playstyles (Commander Spellbook and EDHREC)…"}
    </span>
  );
}

function WaitingFor({
  what,
  commander,
  state,
  failed,
}: {
  what: string;
  commander?: CardDetails;
  state: RemoteState<AnalysisResponse> | undefined;
  failed?: boolean;
}) {
  return (
    <p className="text-sm text-muted">
      {!commander
        ? `Pick a commander to see ${what}.`
        : failed || state?.state === "error"
          ? `Couldn’t load ${what}. Use “Try again” beside the commander.`
          : `Loading ${what}…`}
    </p>
  );
}

function StatusLine({ status, pending }: { status: LoadStatus; pending: number }) {
  if (pending === 0 && status.state === "idle") return null;
  const text =
    status.state === "waiting"
      ? `Waiting ${status.seconds}s because ${status.reason}, then trying again. Every card will load; it just takes a while.`
      : `Loading details for ${formatCount(pending)} ${pending === 1 ? "card" : "cards"} from Scryfall…`;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span aria-hidden className="size-4 spinner" />
      {text}
    </p>
  );
}

function Gallery({
  entries,
  selected,
  onTileClick,
}: {
  entries: Entry[];
  selected: string | null;
  onTileClick: (event: MouseEvent<HTMLButtonElement>, name: string) => void;
}) {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (entry.details === null) continue;
    const group = entry.details ? groupOf(entry.details) : "Loading";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }
  const order = [...GROUPS, "Loading"].filter((g) => groups.has(g));

  return (
    <div className="flex flex-col gap-8">
      {order.map((group) => {
        const cards = groups.get(group)!.sort(
          (a, b) => (a.details?.cmc ?? 0) - (b.details?.cmc ?? 0) || a.asked.localeCompare(b.asked),
        );
        const count = cards.reduce((sum, c) => sum + c.qty, 0);
        return (
          <section key={group}>
            <h2 className="mb-3 text-lg font-semibold">
              {group} <span className="text-sm font-normal text-muted tabular-nums">({formatCount(count)})</span>
            </h2>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {cards.map((entry) => (
                <li key={entry.asked}>
                  <Tile entry={entry} selected={!!entry.details && entry.details.name === selected} onClick={onTileClick} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Tile({
  entry,
  selected,
  onClick,
}: {
  entry: Entry;
  selected: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>, name: string) => void;
}) {
  const card = entry.details;
  const name = card?.name ?? entry.asked;
  const body = (
    <>
      <div
        className={`relative aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle  ${
          selected ? "ring-3 ring-foreground/60" : ""
        }`}
      >
        {card ? <LazyCardImage url={card.imageUrl} alt={name} /> : <ImageNote text="Loading card details…" spinner />}
        <GameChangerTag name={name} className="absolute top-1.5 left-1.5 shadow" />
        {entry.qty > 1 && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-zinc-950/80 px-1.5 text-xs font-semibold text-white tabular-nums">
            ×{entry.qty}
          </span>
        )}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium">
        <span className="truncate" title={name}>
          {name}
        </span>
        {card?.manaCost && <ManaCost cost={card.manaCost.split(" // ")[0]} />}
      </p>
    </>
  );

  if (!card) return <div className="min-w-0">{body}</div>;
  return (
    <button
      type="button"
      onClick={(e) => onClick(e, card.name)}
      aria-label={`${name}: click for what it interacts with, double-click for its synergy map`}
      className="group block w-full min-w-0 text-left select-none focus-visible:outline-none [&:focus-visible>div]:ring-3 [&:focus-visible>div]:ring-foreground/60"
    >
      {body}
    </button>
  );
}

function ImportBox({
  hasDeck,
  onReplace,
  onAdd,
}: {
  hasDeck: boolean;
  onReplace: (cards: ReturnType<typeof parseDeckList>) => void;
  onAdd: (cards: ReturnType<typeof parseDeckList>) => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  async function submit(mode: "replace" | "add") {
    if (isDeckCode(text)) {
      const shared = await decodeDeck(text);
      if (!shared) {
        setMessage("That deck code looks damaged. Copy it again from where you got it.");
        return;
      }
      if (mode === "replace") loadWholeDeck(shared.cards, shared.commander);
      else onAdd(shared.cards);
      const total = shared.cards.reduce((sum, c) => sum + c.qty, 0);
      setMessage(`${mode === "replace" ? "Loaded" : "Added"} ${shared.name ? `“${shared.name}”, ` : ""}${formatCount(total)} ${total === 1 ? "card" : "cards"}.`);
      setText("");
      return;
    }
    const cards = parseDeckList(text);
    if (cards.length === 0) {
      setMessage("No card names found. Put one card per line, like “1 Sol Ring”.");
      return;
    }
    (mode === "replace" ? onReplace : onAdd)(cards);
    const total = cards.reduce((sum, c) => sum + c.qty, 0);
    setMessage(`${mode === "replace" ? "Imported" : "Added"} ${formatCount(total)} ${total === 1 ? "card" : "cards"}.`);
    setText("");
  }

  return (
    <details open={!hasDeck} className="rounded-xl border border-line">
      <summary className="cursor-pointer px-4 py-3 font-medium">{hasDeck ? "Import another list" : "Paste a deck list"}</summary>
      <form
        className="flex flex-col gap-3 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(hasDeck ? "add" : "replace");
        }}
      >
        <label htmlFor={id} className="text-sm text-muted">
          One card per line, as Moxfield, Archidekt or EDHREC export it (“1 Sol Ring”, “1x Sol Ring (CMM) 410”). Up
          to {MAX_DECK_CARDS} different cards. Or paste a deck code (“TT1.…”) from The Theorist.
        </label>
        <textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"1 Lathril, Blade of the Elves\n1 Elvish Archdruid\n1 Llanowar Elves\n1 Sol Ring\n30 Forest"}
          className="w-full rounded-lg border border-line-strong bg-background p-3 font-mono text-sm outline-none focus:border-foreground/40 focus:ring-4 focus:ring-foreground/5"
        />
        <div className="flex flex-wrap items-center gap-3">
          {hasDeck ? (
            <>
              <button type="submit" className="h-10 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/85">
                Add to deck
              </button>
              <button
                type="button"
                onClick={() => void submit("replace")}
                className="h-10 rounded-lg border border-line-strong px-4 text-sm font-medium hover:border-foreground/30"
              >
                Replace deck
              </button>
            </>
          ) : (
            <button type="submit" className="h-10 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/85">
              Import deck
            </button>
          )}
          <span role="status" className="text-sm text-muted">
            {message}
          </span>
        </div>
      </form>
    </details>
  );
}

function ClearButton({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (confirming) onClear();
        setConfirming(!confirming);
      }}
      onBlur={() => setConfirming(false)}
      className={`h-9 rounded-lg border px-3 text-sm ${
        confirming
          ? "border-red-600 text-red-700 dark:text-red-400"
          : "border-line-strong text-muted hover:border-red-500  "
      }`}
    >
      {confirming ? "Click again to clear" : "Clear deck"}
    </button>
  );
}
