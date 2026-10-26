"use client";

import { useParams } from "next/navigation";
import { ViewTransition } from "react";
import { useCardDetails } from "@/lib/binder/card-cache";
import { useSavedDeckSource } from "@/lib/deck-beta/store";
import { formatCount } from "@/lib/format";
import { AppLink as Link } from "../app-link";
import { AddToShopping } from "../deck-beta/add-to-shopping";
import { BracketBadge } from "../deck-beta/bracket-badge";
import { DeckWorkspace, ImportBox } from "../deck-beta/deck-beta";
import { ColorIdentity } from "../mana";
import { RetryingImage } from "../retrying-image";
import { PageHeader } from "../theme/page-header";

/** The view-transition name a deck's commander picture shares between its My Decks tile and its page. */
export const deckArtName = (id: string) => `deck-art-${id}`;

/**
 * A deck from My Decks on its own page: its commander's game plan, the deck by
 * the deckbuilding template and its mana curve, its synergies and combos, and
 * upgrades. Every change (cards added or removed, a new commander) is saved to
 * the deck as it's made.
 */
export function DeckPage() {
  const { id } = useParams<{ id: string }>();
  const source = useSavedDeckSource(id);
  const deck = source.saved;
  // The commander's picture, for decks saved without one.
  const { detailsFor } = useCardDetails(deck?.commander && !deck.commanderImage ? [deck.commander] : []);

  if (!source.ready) return <p className="text-muted">Loading your deck…</p>;
  if (!deck) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold">This deck isn’t in My Decks</h1>
        <p className="text-muted">It may have been deleted, or saved in another browser before The Theorist kept a copy on your computer.</p>
        <Link href="/decks" className="btn btn-primary">
          Back to My Decks
        </Link>
      </div>
    );
  }
  const image = deck.commanderImage ?? (deck.commander ? detailsFor(deck.commander)?.imageUrl : undefined);

  return (
    <DeckWorkspace
      source={source}
      header={(info) => (
        <div className="flex flex-col gap-4">
          <Link href="/decks" className="w-fit text-sm text-muted hover:text-foreground">
            ← My Decks
          </Link>
          <div className="flex items-start gap-5">
            <ViewTransition name={deckArtName(deck.id)} share="morph" default="none">
              <div className="hidden aspect-[488/680] w-28 shrink-0 overflow-hidden rounded-[4.75%] bg-subtle shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)] sm:block">
                {image && <RetryingImage url={image} alt={deck.commander ?? deck.name} />}
              </div>
            </ViewTransition>
            <div className="min-w-0 flex-1">
              <PageHeader
                feature="decks"
                eyebrow="My Decks"
                title={deck.name}
                morphTitle={false}
                aside={info.loaded > 0 && <BracketBadge report={info.report} checking={info.checking} onClick={info.showBracket} />}
                description={
                  <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                    {deck.commander && <span>{deck.commander} ·</span>}
                    <span>
                      {formatCount(info.totalCards)} {info.totalCards === 1 ? "card" : "cards"}
                      {deck.bracket ? ` · built for Bracket ${deck.bracket}` : ""}
                    </span>
                    {info.colors.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        · <ColorIdentity colors={info.colors} />
                      </span>
                    )}
                  </p>
                }
                actions={source.deck.length > 0 && <AddToShopping deck={source.deck} detailsFor={info.detailsFor} />}
              />
            </div>
          </div>
        </div>
      )}
      intro={() => <ImportBox hasDeck={source.deck.length > 0} onReplace={source.replace} onAdd={source.addList} addOnly />}
    />
  );
}
