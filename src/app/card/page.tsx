import type { Metadata } from "next";
import { Suspense } from "react";
import { CardOverview } from "@/components/card-overview";
import { CardSearch } from "@/components/card-search";
import { EdhrecPanel } from "@/components/edhrec-panel";
import { PanelSkeleton, SourceMessage } from "@/components/panel";
import { PrintingsPanel } from "@/components/printings-panel";
import { TcgphPanel } from "@/components/tcgph-panel";
import { reportSourceError } from "@/lib/sources/http";
import { findCard } from "@/lib/sources/scryfall";

export const metadata: Metadata = {
  title: "Card lookup",
};

// Static shell renders immediately; everything that reads searchParams streams in.
export default function CardPage(props: PageProps<"/card">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <Suspense fallback={<CardSearch />}>
        <SearchWithQuery searchParams={props.searchParams} />
      </Suspense>

      <Suspense fallback={<p className="text-zinc-500">Looking up card…</p>}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type SearchParams = PageProps<"/card">["searchParams"];

async function getQuery(searchParams: SearchParams) {
  const { q } = await searchParams;
  return (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
}

async function SearchWithQuery({ searchParams }: { searchParams: SearchParams }) {
  const query = await getQuery(searchParams);
  // A new key resets the box when another search (e.g. a recommendation link) changes the query.
  return <CardSearch key={query} defaultValue={query} />;
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const query = await getQuery(searchParams);
  if (!query) {
    return <SourceMessage>Enter a card name to begin.</SourceMessage>;
  }

  // 1. Scryfall resolves the typed text to one exact card name.
  let lookup;
  try {
    lookup = await findCard(query);
  } catch (error) {
    reportSourceError("card page", error);
    return <SourceMessage>Couldn’t reach Scryfall right now. Try again in a bit.</SourceMessage>;
  }
  if (!lookup) {
    return (
      <SourceMessage>
        No card found for “{query}”. Check the spelling and try again.
      </SourceMessage>
    );
  }

  // 2 + 3. EDHREC and TCGph are looked up in parallel using that name; each streams in on its own.
  return (
    <div className="flex flex-col gap-8">
      <CardOverview lookup={lookup} />
      <Suspense fallback={<PanelSkeleton title="Printings" />}>
        <PrintingsPanel card={lookup.card} />
      </Suspense>
      <Suspense fallback={<PanelSkeleton title="Philippine store prices" />}>
        <TcgphPanel card={lookup.card} />
      </Suspense>
      <Suspense fallback={<PanelSkeleton title="EDHREC" />}>
        <EdhrecPanel card={lookup.card} />
      </Suspense>
    </div>
  );
}
