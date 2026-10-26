import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import { Suspense } from "react";
import { MyDecks } from "@/components/decks/my-decks";
import { PageHeader } from "@/components/theme/page-header";
import { PageTransition } from "@/components/theme/page-transition";

export const metadata: Metadata = {
  title: "My Decks",
};

// Saved decks live in the visitor's browser, so the list renders on the client.
export default function DecksPage() {
  return (
    <PageTransition>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
        <PageHeader
          feature="decks"
          eyebrow="Your decks"
          description="Click a deck for its game plan, mana curve, synergies and combos. Right-click it to add only the cards you’re missing to Shopping."
          actions={
            <>
              <Link href="/deck" className="btn btn-secondary btn-lg">
                Check a pasted list
              </Link>
              <Link href="/decks/new" className="btn btn-primary btn-lg">
                Create Commander Deck
              </Link>
            </>
          }
        />
        <Suspense fallback={<p className="text-muted">Loading your decks…</p>}>
          <MyDecks />
        </Suspense>
      </main>
    </PageTransition>
  );
}
