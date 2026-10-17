import type { ReactNode } from "react";

export function Panel({
  title,
  source,
  sourceUrl,
  children,
}: {
  title: string;
  source: string;
  sourceUrl?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-amber-700 hover:underline dark:text-amber-400"
          >
            View on {source} ↗
          </a>
        ) : (
          <span className="text-sm text-zinc-500">via {source}</span>
        )}
      </header>
      {children}
    </section>
  );
}

export function PanelSkeleton({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="flex flex-col gap-2" aria-label="Loading">
        <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </section>
  );
}

export function SourceMessage({ children }: { children: ReactNode }) {
  return <p className="text-zinc-600 dark:text-zinc-400">{children}</p>;
}
