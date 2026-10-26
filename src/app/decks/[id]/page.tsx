import type { Metadata } from "next";
import { Suspense } from "react";
import { DeckPage } from "@/components/decks/deck-page";
import { PageTransition } from "@/components/theme/page-transition";

export const metadata: Metadata = {
  title: "Deck",
};

// Saved decks live in the visitor's browser (and on their computer), so the deck renders on the client.
export default function SavedDeckPage() {
  return (
    <PageTransition>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-12 sm:px-6">
        <Suspense fallback={<p className="text-muted">Loading your deck…</p>}>
          <DeckPage />
        </Suspense>
      </main>
    </PageTransition>
  );
}
