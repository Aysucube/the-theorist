import type { ComponentType, SVGProps } from "react";
import { BinderIcon, CreateIcon, DecksIcon, MarketIcon, ShoppingIcon, SynergyIcon } from "./icons";

export type FeatureId = "create" | "binder" | "decks" | "synergy" | "market" | "shopping";

export interface Feature {
  id: FeatureId;
  href: string;
  title: string;
  blurb: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** The parts of the app, as the front page's tiles and each page's header show them. */
export const FEATURES: Record<FeatureId, Feature> = {
  create: {
    id: "create",
    href: "/decks/new",
    title: "Create Commander Deck",
    blurb: "Build a deck from your binder, step by step, with recommendations that grow with it.",
    Icon: CreateIcon,
  },
  binder: {
    id: "binder",
    href: "/binder",
    title: "Binder",
    blurb: "Your whole collection, from a pasted list or a CSV export.",
    Icon: BinderIcon,
  },
  decks: {
    id: "decks",
    href: "/decks",
    title: "My Decks",
    blurb: "Every deck you’ve made. Send what you’re missing to Shopping.",
    Icon: DecksIcon,
  },
  synergy: {
    id: "synergy",
    href: "/deck",
    title: "Check a Deck",
    blurb: "Paste any list to see its curve, game plan, synergies and combos without saving it.",
    Icon: SynergyIcon,
  },
  market: {
    id: "market",
    href: "/market",
    title: "Market",
    blurb: "The cards whose price is climbing, in pesos, with the cheapest copy in Philippine stores.",
    Icon: MarketIcon,
  },
  shopping: {
    id: "shopping",
    href: "/shopping",
    title: "Shopping",
    blurb: "Price a list across Philippine stores, in the fewest stops.",
    Icon: ShoppingIcon,
  },
};

/** View-transition names shared by a feature's tile and its page header, so one morphs into the other. */
export const morphName = (id: FeatureId, part: "icon" | "title") => `feature-${id}-${part}`;
