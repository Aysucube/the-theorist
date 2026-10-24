import Link from "next/link";
import { Suspense } from "react";
import { CardSearch } from "@/components/card-search";
import { MarketTrendsSection } from "@/components/market-trends";
import { PanelSkeleton, SourceMessage } from "@/components/panel";
import { ThemePicker } from "@/components/theme-picker";
import { ThemeResults } from "@/components/theme-results";
import { getThemes } from "@/lib/sources/edhrec";
import { reportSourceError } from "@/lib/sources/http";
import type { EdhrecTheme } from "@/lib/types";

const sources = [
  {
    title: "Scryfall",
    body: "Finds the exact card from what you type: image, rules text, and Commander legality.",
  },
  {
    title: "EDHREC",
    body: "How often Commander players run it. For commanders, the cards most decks pair with them.",
  },
  {
    title: "TCGph",
    body: "What it costs right now at Philippine game stores, in pesos, cheapest first.",
  },
];

export default function Home(props: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-24 px-4 pt-20 pb-24 sm:px-6">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Commander, priced in pesos</p>
          <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[3.25rem]">
            Build your Commander deck at local prices.
          </h1>
          <p className="max-w-lg text-[1.0625rem] leading-relaxed text-muted">
            Search any card once. We check Scryfall, EDHREC and TCGph and put the results on one page.
          </p>
        </div>

        <CardSearch />

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/decks/new" className="btn btn-primary">
            Create a Commander deck
          </Link>
          <Link href="/binder" className="btn btn-secondary">
            Open your binder
          </Link>
        </div>

        <dl className="grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
          {sources.map((source) => (
            <div key={source.title}>
              <dt className="text-sm font-medium">{source.title}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{source.body}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section id="trends" className="flex scroll-mt-20 flex-col gap-6">
        <div>
          <p className="eyebrow">Market</p>
          <h2 className="mt-1 text-2xl font-semibold">Price trends</h2>
          <p className="mt-1 max-w-2xl text-muted">
            Cards whose market price jumped the most lately, and what the cheapest copy costs in Philippine stores
            right now.
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-muted">Loading price trends…</p>}>
          <MarketTrendsSection />
        </Suspense>
      </section>

      <section id="theme" className="flex scroll-mt-20 flex-col gap-6">
        <div>
          <p className="eyebrow">Explore</p>
          <h2 className="mt-1 text-2xl font-semibold">Browse by deck theme</h2>
          <p className="mt-1 max-w-2xl text-muted">
            Pick an archetype to see the commanders most often built around it on EDHREC, and the cards
            those decks play. The number on each theme is how many decks use it.
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-muted">Loading themes…</p>}>
          <Themes searchParams={props.searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

async function Themes({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { theme } = await searchParams;
  const slug = (Array.isArray(theme) ? theme[0] : theme)?.trim().toLowerCase() || undefined;

  let themes: EdhrecTheme[];
  try {
    themes = await getThemes();
  } catch (error) {
    reportSourceError("home themes", error);
    return <SourceMessage>Couldn’t load EDHREC’s themes right now. Try again in a bit.</SourceMessage>;
  }

  return (
    <>
      <ThemePicker themes={themes} selected={slug} />
      {slug && (
        // A new key shows the loading state again when another theme is picked.
        <Suspense key={slug} fallback={<PanelSkeleton title="Loading theme…" />}>
          <ThemeResults slug={slug} />
        </Suspense>
      )}
    </>
  );
}
