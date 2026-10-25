"use client";

import { AppLink as Link } from "@/components/app-link";
import { useEffect } from "react";

// Shown when a page throws. Source outages are handled inside each panel, so
// reaching this means something unexpected; log it for the host's logs.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted">
        The page couldn’t load. This is usually temporary.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="btn btn-primary h-10 px-4 text-sm"
        >
          Try again
        </button>
        <Link
          href="/"
          className="btn btn-secondary h-10 px-4"
        >
          Go to search
        </Link>
      </div>
    </main>
  );
}
