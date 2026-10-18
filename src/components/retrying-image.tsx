"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getImageStatus, subscribeImage } from "@/lib/image-loader";

/**
 * A card image that shows a spinner and retry status until it has really
 * loaded, retrying slow or failed downloads. The download is shared with every
 * other place showing the same image and outlives this component.
 */
export function RetryingImage({
  url,
  alt = "",
  failedText = "Image couldn’t load. Reload the page to retry.",
}: {
  url: string;
  alt?: string;
  failedText?: string;
}) {
  const subscribe = useCallback((notify: () => void) => subscribeImage(url, notify), [url]);
  const state = useSyncExternalStore(
    subscribe,
    () => getImageStatus(url),
    () => getImageStatus(url),
  );

  if (state.src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={state.src} alt={alt} width={488} height={680} className="h-full w-full object-cover" />;
  }
  if (state.failed) return <ImageNote text={failedText} />;
  if (state.retryIn !== undefined) {
    return <ImageNote text={`Image is slow; retrying in ${state.retryIn}s (try ${(state.attempt ?? 0) + 1})…`} spinner />;
  }
  return <ImageNote text="Loading image…" spinner />;
}

export function ImageNote({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-[11px] text-zinc-500">
      {spinner && (
        <span
          aria-hidden
          className="size-5 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500 dark:border-zinc-600 dark:border-t-amber-400"
        />
      )}
      {text}
    </div>
  );
}
