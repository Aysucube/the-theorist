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
    <section className="rounded-xl border border-line bg-background p-5 sm:p-7">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm link"
          >
            View on {source} ↗
          </a>
        ) : (
          <span className="text-sm text-muted">via {source}</span>
        )}
      </header>
      {children}
    </section>
  );
}

export function PanelSkeleton({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-line bg-background p-5 sm:p-7">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="flex flex-col gap-2" aria-label="Loading">
        <div className="h-4 w-2/3 animate-pulse rounded bg-subtle" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-subtle" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-subtle" />
      </div>
    </section>
  );
}

export function SourceMessage({ children }: { children: ReactNode }) {
  return <p className="text-muted">{children}</p>;
}
