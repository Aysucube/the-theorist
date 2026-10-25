import type { Metadata } from "next";
import { CreateDeck } from "@/components/builder/create-deck";
import { PageTransition } from "@/components/theme/page-transition";

export const metadata: Metadata = {
  title: "Create Commander Deck",
};

// The deck being made, the binder and the saved decks all live in the browser.
export default function CreateDeckPage() {
  return (
    <PageTransition>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-12 sm:px-6">
        <CreateDeck />
      </main>
    </PageTransition>
  );
}
