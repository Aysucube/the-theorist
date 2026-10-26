"use client";

import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { motion, MotionConfig } from "motion/react";
import { useSearchParams } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { useCardDetails } from "@/lib/binder/card-cache";
import { missingFromBinder, ownedCounts } from "@/lib/binder/collection";
import { useBinder } from "@/lib/binder/store";
import { useBuilderDraft } from "@/lib/builder/draft";
import { deckToText, encodeDeck } from "@/lib/deck-beta/deck-code";
import { useDeckLibrary, type SavedDeck } from "@/lib/deck-beta/store";
import { formatCount } from "@/lib/format";
import { useDeck } from "@/lib/use-deck";
import { AppLink as Link, useAppRouter } from "../app-link";
import { RetryingImage } from "../retrying-image";
import { deckArtName } from "./deck-page";

const savedDate = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

/**
 * My Decks: every saved deck with its commander up front. Click one to open it
 * in Deck Synergy; right-click (or the ⋯ button) to add just the cards it's
 * missing from the binder to Shopping, copy it, or delete it.
 */
export function MyDecks() {
  const router = useAppRouter();
  const params = useSearchParams();
  const fresh = params.get("new");
  const { decks, remove, restore } = useDeckLibrary();
  const binder = useBinder();
  const shopping = useDeck();
  const { draft } = useBuilderDraft();
  const counts = ownedCounts(binder.cards);
  // Pictures for decks saved before they kept their commander's.
  const { detailsFor } = useCardDetails(decks.filter((d) => !d.commanderImage && d.commander).map((d) => d.commander!));

  const actions = (deck: SavedDeck) => {
    const missing = missingFromBinder(deck.cards, counts);
    const missingWithBasics = missingFromBinder(deck.cards, counts, true);
    const copies = (list: { qty: number }[]) => list.reduce((sum, c) => sum + c.qty, 0);
    const addToShopping = (list: typeof missing) => {
      if (list.length === 0) return toast("You have every card in this deck.");
      shopping.importCards(list);
      toast.success(`Added ${formatCount(copies(list))} missing ${copies(list) === 1 ? "card" : "cards"} to Shopping`, {
        description: deck.name,
        action: { label: "Open", onClick: () => router.push("/shopping") },
      });
    };
    const copy = async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(`Copied the ${what}`);
      } catch {
        toast.error("Couldn’t copy: your browser blocked the clipboard.");
      }
    };
    return {
      missing: copies(missing),
      items: [
        { label: `Add ${formatCount(copies(missing))} missing to Shopping`, onClick: () => addToShopping(missing), disabled: missing.length === 0 },
        { label: "Add missing, with basic lands", onClick: () => addToShopping(missingWithBasics), disabled: missingWithBasics.length === missing.length },
        "separator" as const,
        { label: "Open deck", onClick: () => open(deck) },
        { label: "Copy deck code", onClick: async () => copy(await encodeDeck(deck), "deck code") },
        { label: "Copy as a list", onClick: () => copy(deckToText(deck), "list") },
        "separator" as const,
        {
          label: "Delete",
          onClick: () => {
            remove(deck.id);
            toast(`Deleted ${deck.name}`, { action: { label: "Undo", onClick: () => restore(deck) } });
          },
        },
      ],
    };
  };

  function open(deck: SavedDeck) {
    router.push(`/decks/${deck.id}`);
  }

  return (
    <MotionConfig reducedMotion="user">
      <ul className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        <li>
          <Link
            href="/decks/new"
            className="group flex aspect-[488/680] flex-col items-center justify-center gap-3 rounded-[4.75%] border border-dashed border-line-strong text-center text-sm text-muted transition-colors duration-150 hover:border-accent/50 hover:text-foreground"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-subtle text-xl text-foreground">+</span>
            {draft.commander ? (
              <span className="px-4">
                Continue building
                <span className="block font-medium text-foreground">{draft.commander.name.split(",")[0]}</span>
              </span>
            ) : (
              "Create Commander Deck"
            )}
          </Link>
        </li>
        {decks.map((deck, i) => {
          const image = deck.commanderImage ?? (deck.commander ? detailsFor(deck.commander)?.imageUrl : undefined);
          const { missing, items } = actions(deck);
          const total = deck.cards.reduce((sum, c) => sum + c.qty, 0);
          return (
            <motion.li
              key={deck.id}
              initial={deck.id === fresh ? { opacity: 0, transform: "scale(0.96)" } : { opacity: 0, transform: "translateY(8px)" }}
              animate={deck.id === fresh ? { opacity: 1, transform: "scale(1)" } : { opacity: 1, transform: "translateY(0px)" }}
              transition={deck.id === fresh ? { type: "spring", duration: 0.6, bounce: 0.2 } : { duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: Math.min(i, 12) * 0.03 }}
              className="group relative min-w-0"
            >
              {/* Kept apart: a Menu inside ContextMenu.Root would take over as the context menu. */}
              <ContextMenu.Root>
                <ContextMenu.Trigger
                  render={
                    <button
                      type="button"
                      onClick={() => open(deck)}
                      aria-label={`${deck.name}: open its game plan, curve, synergies and combos. Right-click for more.`}
                      className="block w-full text-left"
                    />
                  }
                >
                  {/* The commander's picture morphs into the deck page's header. */}
                  <ViewTransition name={deckArtName(deck.id)} share="morph" default="none">
                    <span
                      className={`block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle shadow-[0_10px_30px_-14px_rgb(0_0_0/0.5)] transition-transform duration-200 ease-out group-hover:-translate-y-0.5 ${
                        deck.id === fresh ? "ring-2 ring-accent ring-offset-4 ring-offset-background" : ""
                      }`}
                    >
                      {image && <RetryingImage url={image} alt={deck.commander ?? deck.name} />}
                    </span>
                  </ViewTransition>
                  <span className="mt-3 block truncate text-[15px] font-medium tracking-tight">{deck.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {[`${formatCount(total)} cards`, deck.bracket ? `Bracket ${deck.bracket}` : null, savedDate.format(deck.savedAt)].filter(Boolean).join(" · ")}
                  </span>
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] ${missing > 0 ? "bg-subtle text-foreground/80" : "bg-accent text-on-accent"}`}>
                    {missing > 0 ? `${formatCount(missing)} to buy` : "All in your binder"}
                  </span>
                </ContextMenu.Trigger>
                <MenuItems kind="context" items={items} />
              </ContextMenu.Root>
              <Menu.Root>
                <Menu.Trigger
                  aria-label={`More for ${deck.name}`}
                  className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/85 text-muted shadow backdrop-blur transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 data-[popup-open]:opacity-100"
                >
                  ⋯
                </Menu.Trigger>
                <MenuItems kind="menu" items={items} />
              </Menu.Root>
            </motion.li>
          );
        })}
      </ul>
      {decks.length === 0 && (
        <p className="mt-10 max-w-md text-sm text-muted">
          No decks yet. Create one from your binder, or save one from Deck Synergy, and it shows up here.
        </p>
      )}
    </MotionConfig>
  );
}

type Item = { label: string; onClick: () => void; disabled?: boolean } | "separator";

/** The same items in a right-click menu or the ⋯ menu. */
function MenuItems({ kind, items }: { kind: "menu" | "context"; items: Item[] }) {
  const Parts = kind === "menu" ? Menu : ContextMenu;
  const body: ReactNode = items.map((item, i) =>
    item === "separator" ? (
      <Parts.Separator key={i} className="menu-separator" />
    ) : (
      <Parts.Item key={item.label} disabled={item.disabled} onClick={item.onClick} className="menu-item">
        {item.label}
      </Parts.Item>
    ),
  );
  return (
    <Parts.Portal>
      <Parts.Positioner sideOffset={kind === "menu" ? 6 : 0} align={kind === "menu" ? "end" : "start"} className="z-50 outline-none">
        <Parts.Popup className="menu-popup">{body}</Parts.Popup>
      </Parts.Positioner>
    </Parts.Portal>
  );
}
