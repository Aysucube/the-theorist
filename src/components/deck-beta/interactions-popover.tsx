"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pairingsInDeck } from "@/lib/deck-beta/recommend";
import { usePairings, useRulings } from "@/lib/deck-beta/store";
import { interactionsOf, type DeckAnalysis } from "@/lib/deck-beta/synergy";
import { placeHoverCard } from "@/lib/hover-card";
import type { CardDetails } from "@/lib/types";
import { GameChangerTag } from "../game-changer-tag";
import { ColorIdentity, ManaCost } from "../mana";
import { RetryingImage } from "../retrying-image";
import { BetaRulings } from "./beta-rulings";
import { formatLift, LinkRow, MiniGallery, pairingsMessage } from "./bits";

const WIDTH = 380;

/**
 * The preview a click opens: which of the deck's cards this one interacts
 * with, by card type, subtype and theme, plus EDHREC's "played together" data.
 */
export function InteractionsPopover({
  card,
  anchor,
  analysis,
  cards,
  onClose,
  onOpenMap,
  onRemove,
}: {
  card: CardDetails;
  anchor: DOMRect;
  analysis: DeckAnalysis;
  /** The deck's loaded cards, for names and artwork. */
  cards: CardDetails[];
  onClose: () => void;
  onOpenMap: () => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const pairings = usePairings(card);
  const rulings = useRulings(card);
  const [view, setView] = useState<"interactions" | "rulings">("interactions");
  const byName = new Map(cards.map((c) => [c.name, c]));
  const cardFor = (name: string) => byName.get(name);

  const traits = analysis.traits.get(card.name);
  const links = traits ? interactionsOf(traits, analysis.traits, card.name) : { uses: [], usedBy: [] };
  const edhrec =
    pairings?.state === "done" && pairings.result.found ? pairingsInDeck(pairings.result.pairings, [...byName.keys()]).filter((p) => p.name !== card.name) : [];

  // Placed beside the card that was clicked, kept on screen, and scrolling with the page.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const place = placeHoverCard(anchor, { width: window.innerWidth, height: window.innerHeight }, { width: Math.min(WIDTH, window.innerWidth - 24), height: element.offsetHeight });
    setPosition({ left: place.left + window.scrollX, top: place.top + window.scrollY });
  }, [anchor]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${card.name}: interactions`}
      tabIndex={-1}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, width: `min(${WIDTH}px, calc(100vw - 24px))` }}
      className={`absolute z-40 flex max-h-[80vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-900 ${
        position ? "" : "invisible"
      }`}
    >
      <div className="flex gap-3 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div className="aspect-[488/680] w-30 shrink-0 overflow-hidden rounded-[4.75%] bg-zinc-200 dark:bg-zinc-800">
          {card.imageUrl && <RetryingImage url={card.imageUrl} alt={card.name} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">
              {card.name}
              <GameChangerTag name={card.name} className="ml-1.5" />
            </p>
            <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 rounded px-1.5 text-lg leading-none text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              ×
            </button>
          </div>
          {card.manaCost && <ManaCost cost={card.manaCost.split(" // ")[0]} />}
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{card.typeLine}</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            <ColorIdentity colors={card.colorIdentity} />
          </p>
        </div>
      </div>

      <div role="tablist" className="flex border-b border-zinc-200 dark:border-zinc-800">
        {(["interactions", "rulings"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`flex-1 px-3 py-2 text-sm font-medium ${view === v ? "border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
          >
            {v === "interactions"
              ? "Interacts with"
              : `Rulings${rulings?.state === "done" && rulings.result.found ? ` (${rulings.result.rulings.length})` : ""}`}
          </button>
        ))}
      </div>

      {view === "rulings" ? (
        <div className="p-3">
          <BetaRulings card={card} />
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto p-3">
          <section>
            <h3 className="mb-2 font-semibold">Interacts with</h3>
            {links.uses.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {links.uses.map((link) => (
                  <LinkRow key={link.tag} link={link} cardFor={cardFor} hoverPreview />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500">Nothing in its rules text points at other cards in your deck.</p>
            )}
          </section>

          {links.usedBy.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold">Cards in your deck that want it</h3>
              <ul className="flex flex-col gap-3">
                {links.usedBy.map((link) => (
                  <LinkRow key={link.tag} link={link} cardFor={cardFor} hoverPreview />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-1 font-semibold">EDHREC: played with it</h3>
            {pairingsMessage(pairings) ?? (
              <>
                <p className="mb-2 text-xs text-zinc-500">
                  {edhrec.length > 0
                    ? `${edhrec.length} of your cards show up with it more often than usual in EDHREC decks.`
                    : pairings?.state === "done" && !pairings.result.found
                      ? "EDHREC has no page for this card."
                      : "None of your other cards stand out as EDHREC partners for it."}
                </p>
                {edhrec.length > 0 && (
                  <MiniGallery
                    label="Played with it on EDHREC"
                    items={edhrec.map((p) => ({ name: p.name, note: formatLift(p.lift) }))}
                    cardFor={cardFor}
                    hoverPreview
                  />
                )}
              </>
            )}
          </section>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <button type="button" onClick={onOpenMap} className="h-9 rounded-lg bg-amber-500 px-3 text-sm font-medium text-zinc-950 hover:bg-amber-400">
          Open synergy map
        </button>
        <button type="button" onClick={onRemove} className="text-xs text-zinc-500 hover:text-red-700 hover:underline dark:hover:text-red-400">
          Remove from deck
        </button>
      </div>
    </div>,
    document.body,
  );
}
