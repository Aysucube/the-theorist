import type { Metadata } from "next";
import { DeckBeta } from "@/components/deck-beta/deck-beta";

export const metadata: Metadata = {
  title: "Deck (beta)",
};

// The beta deck is stored in the visitor's browser, so everything renders on the client.
export default function DeckBetaPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
      <DeckBeta />
    </main>
  );
}
