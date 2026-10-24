import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MyDecks } from "@/components/decks/my-decks";

export const metadata: Metadata = {
  title: "My Decks",
};

// Saved decks live in the visitor's browser, so the list renders on the client.
export default function DecksPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Your decks</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">My Decks</h1>
          <p className="mt-1 max-w-lg text-muted">Right-click a deck to add only the cards you’re missing to Shopping.</p>
        </div>
        <Link href="/decks/new" className="btn btn-primary btn-lg">
          Create Commander Deck
        </Link>
      </header>
      <Suspense fallback={<p className="text-muted">Loading your decks…</p>}>
        <MyDecks />
      </Suspense>
    </main>
  );
}
