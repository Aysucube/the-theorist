import { CardSearch } from "@/components/card-search";

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

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-12 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
          Commander PH
        </p>
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
    </main>
  );
}
