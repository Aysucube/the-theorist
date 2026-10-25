import type { ReactNode } from "react";

/** A section of a page with its source credited; it pops in when it arrives. */
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
    <section className="surface reveal rounded-2xl p-5 sm:p-7">
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
    <section className="surface rounded-2xl p-5 sm:p-7">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="flex flex-col gap-2" aria-label="Loading">
        <div className="skeleton h-4 w-2/3 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-4 w-3/5 rounded" />
      </div>
    </section>
  );
}

export function SourceMessage({ children }: { children: ReactNode }) {
  return <p className="text-muted">{children}</p>;
}
