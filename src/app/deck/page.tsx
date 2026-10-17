import type { Metadata } from "next";
import { DeckView } from "@/components/deck-view";

export const metadata: Metadata = {
  title: "Your deck",
};

// The deck is stored in the visitor's browser, so everything renders on the client.
export default function DeckPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
      <DeckView />
    </main>
  );
}
