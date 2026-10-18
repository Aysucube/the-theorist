import { Suspense } from "react";
import { CardSearch } from "@/components/card-search";
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-16 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Build your Commander deck at local prices.
          </h1>
          <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Search any card once. We check Scryfall, EDHREC and TCGph and put the results
            on one page.
          </p>
        </div>

        <CardSearch />

        <ul className="grid gap-4 sm:grid-cols-3">
          {sources.map((source) => (
            <li
              key={source.title}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <h2 className="font-medium">{source.title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{source.body}</p>
            </li>
          ))}
        </ul>
      </div>

      <section id="theme" className="flex scroll-mt-6 flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Browse by deck theme</h2>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Pick an archetype to see the commanders most often built around it on EDHREC, and the cards
            those decks play. The number on each theme is how many decks use it.
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading themes…</p>}>
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
