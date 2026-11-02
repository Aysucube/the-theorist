"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useShownSide } from "@/lib/card-faces";
import { getImageStatus, subscribeImage } from "@/lib/image-loader";

const TURN = [{ transform: "perspective(900px) rotateY(90deg)" }, { transform: "perspective(900px) rotateY(0deg)" }];
const TURN_TIMING = { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };

/**
 * A card image that shows a spinner and retry status until it has really
 * loaded, retrying slow or failed downloads. The download is shared with every
 * other place showing the same image and outlives this component. A two-sided
 * card shows whichever side it's been turned to (see lib/card-faces.ts).
 */
export function RetryingImage({
  url: front,
  alt = "",
  failedText = "Image couldn’t load. Reload the page to retry.",
}: {
  url: string;
  alt?: string;
  failedText?: string;
}) {
  const url = useShownSide(front);
  const onBack = url !== front;
  const subscribe = useCallback((notify: () => void) => subscribeImage(url, notify), [url]);
  const state = useSyncExternalStore(
    subscribe,
    () => getImageStatus(url),
    () => getImageStatus(url),
  );

  // It swings round once the side it's turning to has loaded.
  const image = useRef<HTMLImageElement>(null);
  const wasOnBack = useRef(onBack);
  useEffect(() => {
    if (!state.src || wasOnBack.current === onBack) return;
    wasOnBack.current = onBack;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) image.current?.animate(TURN, TURN_TIMING);
  }, [onBack, state.src]);

  if (state.src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img ref={image} src={state.src} alt={alt} width={488} height={680} className="h-full w-full object-cover" />;
  }
  if (state.failed) return <ImageNote text={failedText} />;
  if (state.retryIn !== undefined) {
    return <ImageNote text={`Image is slow; retrying in ${state.retryIn}s (try ${(state.attempt ?? 0) + 1})…`} spinner />;
  }
  return <ImageNote text="Loading image…" spinner />;
}

export function ImageNote({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-[11px] text-muted">
      {spinner && (
        <span
          aria-hidden
          className="size-5 spinner"
        />
      )}
      {text}
    </div>
  );
}
