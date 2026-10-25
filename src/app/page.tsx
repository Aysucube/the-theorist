import { Suspense } from "react";
import { CardSearch } from "@/components/card-search";
import { FeatureTiles } from "@/components/feature-tiles";
import { PanelSkeleton, SourceMessage } from "@/components/panel";
import { ThemePicker } from "@/components/theme-picker";
import { ThemeResults } from "@/components/theme-results";
import { PageTransition } from "@/components/theme/page-transition";
import { Sigil } from "@/components/theme/sigil";
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
    <PageTransition>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-24 px-4 pt-14 pb-24 sm:px-6 sm:pt-20">
        <div className="relative flex flex-col gap-12">
          <Sigil turn className="pointer-events-none absolute -top-28 -right-44 -z-10 hidden size-[560px] text-accent/20 lg:block" />
          <div className="flex w-full max-w-2xl flex-col gap-8">
            <div className="flex flex-col gap-4">
              <p className="eyebrow">Commander, priced in pesos</p>
              <h1 className="bg-[linear-gradient(180deg,#f4f8ff_25%,#9cc8ff)] bg-clip-text pb-1 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-transparent sm:text-[3.25rem]">
                Build your Commander deck at local prices.
              </h1>
              <p className="max-w-lg text-[1.0625rem] leading-relaxed text-muted">
                Search any card once. We check Scryfall, EDHREC and TCGph and put the results on one page.
              </p>
            </div>
            <CardSearch />
          </div>
          <FeatureTiles />
        </div>

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

        <section className="flex flex-col gap-6 border-t border-line pt-10">
          <p className="eyebrow">Where the numbers come from</p>
          <dl className="grid gap-6 sm:grid-cols-3">
            {sources.map((source) => (
              <div key={source.title}>
                <dt className="text-sm font-medium">{source.title}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted">{source.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </PageTransition>
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
        // A new key shows the loading state again when another theme is picked; the results pop in.
        <Suspense key={slug} fallback={<PanelSkeleton title="Loading theme…" />}>
          <div className="reveal">
            <ThemeResults slug={slug} />
          </div>
        </Suspense>
      )}
    </>
  );
}
