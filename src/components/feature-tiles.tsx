"use client";

import { ViewTransition } from "react";
import { useBinder } from "@/lib/binder/store";
import { useBuilderDraft } from "@/lib/builder/draft";
import { useDeckLibrary } from "@/lib/deck-beta/store";
import { formatCount } from "@/lib/format";
import { useDeck } from "@/lib/use-deck";
import { AppLink } from "./app-link";
import { FEATURES, morphName, type Feature } from "./theme/features";
import { ArrowRightIcon } from "./theme/icons";
import { FeatureBadge } from "./theme/page-header";
import { Sigil } from "./theme/sigil";

const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

/**
 * The front page's way into each part of the app: a big tile for creating a
 * deck and one for each other feature, with what's waiting there (a deck in
 * progress, the binder's size, cards to buy). Opening a tile morphs its icon
 * and title into the page's header.
 */
export function FeatureTiles() {
  const binder = useBinder();
  const { draft } = useBuilderDraft();
  const { decks } = useDeckLibrary();
  const shopping = useDeck();
  const ready = binder.ready;
  const toBuy = shopping.deck.reduce((sum, c) => sum + c.qty, 0);

  const status: Record<Feature["id"], string> = {
    create: draft.commander
      ? `Continue ${draft.commander.name.split(",")[0]}`
      : binder.cards.length > 0
        ? `${plural(binder.cards.length, "card")} to build from`
        : "Start from any commander",
    binder: binder.cards.length > 0 ? plural(binder.cards.length, "card") : "Import your collection",
    decks: decks.length > 0 ? `${plural(decks.length, "deck")} saved` : "No decks yet",
    synergy: "Beta",
    shopping: toBuy > 0 ? `${plural(toBuy, "card")} to buy` : "Your list is empty",
  };

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <li className="sm:col-span-2 lg:row-span-2">
        <Tile feature={FEATURES.create} status={ready ? status.create : undefined} big />
      </li>
      {(["binder", "decks", "synergy", "shopping"] as const).map((id) => (
        <li key={id}>
          <Tile feature={FEATURES[id]} status={ready ? status[id] : undefined} />
        </li>
      ))}
    </ul>
  );
}

function Tile({ feature, status, big = false }: { feature: Feature; status?: string; big?: boolean }) {
  return (
    <AppLink href={feature.href} className={`feature-tile group h-full ${big ? "min-h-64 p-6 sm:p-7" : "min-h-44 p-5"}`}>
      {big && <Sigil className="pointer-events-none absolute -right-16 -bottom-20 -z-10 size-80 text-accent opacity-25" />}
      <ViewTransition name={morphName(feature.id, "icon")} share="morph" default="none">
        <FeatureBadge Icon={feature.Icon} size={big ? "lg" : "md"} />
      </ViewTransition>
      {/* Spacing sits outside the title so its box (what morphs) hugs the text, like the header's. */}
      <span aria-hidden className="block min-h-6 flex-1" />
      <ViewTransition name={morphName(feature.id, "title")} share="morph" default="none">
        <h2 className={`w-fit font-semibold tracking-[-0.02em] ${big ? "text-2xl" : "text-lg"}`}>{feature.title}</h2>
      </ViewTransition>
      <p className={`mt-1 text-sm leading-relaxed text-muted ${big ? "max-w-sm" : ""}`}>{feature.blurb}</p>
      <p className="mt-4 flex items-center justify-between gap-2 text-[13px] font-medium text-accent">
        <span className="min-h-5 truncate">{status}</span>
        <ArrowRightIcon className="size-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-1" />
      </p>
    </AppLink>
  );
}
