import Form from "next/form";

export function CardSearch({ defaultValue }: { defaultValue?: string }) {
  return (
    <Form action="/card" className="flex w-full gap-2">
      <label htmlFor="card-query" className="sr-only">
        Card name
      </label>
      <input
        id="card-query"
        name="q"
        type="search"
        required
        defaultValue={defaultValue}
        placeholder="Search a card, e.g. Sol Ring or Atraxa"
        autoComplete="off"
        className="h-12 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        className="h-12 rounded-lg bg-amber-500 px-5 font-medium text-zinc-950 transition-colors hover:bg-amber-400"
      >
        Search
      </button>
    </Form>
  );
}
