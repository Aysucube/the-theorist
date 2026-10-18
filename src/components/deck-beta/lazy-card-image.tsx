"use client";

import { useEffect, useRef, useState } from "react";
import { ImageNote, RetryingImage } from "../retrying-image";

/**
 * A card image that starts downloading only when it's near the screen, so a
 * 100-card gallery doesn't ask for 100 images at once on a slow connection
 * (which made them time out and retry). Once started, it keeps its place.
 */
export function LazyCardImage({ url, alt }: { url?: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  return (
    <div ref={ref} className="h-full w-full">
      {!url ? (
        <ImageNote text="No image available" />
      ) : near ? (
        <RetryingImage url={url} alt={alt} />
      ) : (
        <ImageNote text="Waiting to load…" />
      )}
    </div>
  );
}
