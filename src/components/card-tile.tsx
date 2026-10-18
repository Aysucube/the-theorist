import type { ReactNode } from "react";
import { CardLink } from "./card-link";
import { ImageNote, RetryingImage } from "./retrying-image";

/**
 * A gallery tile: the card's artwork and name (hover for the info window,
 * click to open the card), with optional details such as a price underneath.
 */
export function CardTile({ name, imageUrl, children }: { name: string; imageUrl?: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <CardLink name={name} className="group block">
        <div className="aspect-[488/680] overflow-hidden rounded-[4.75%] bg-zinc-200 transition-opacity group-hover:opacity-90 dark:bg-zinc-800">
          {imageUrl ? <RetryingImage url={imageUrl} alt={name} /> : <ImageNote text="No image available" />}
        </div>
        <p className="mt-1.5 truncate text-xs font-medium group-hover:underline" title={name}>
          {name}
        </p>
      </CardLink>
      {children && <div className="mt-0.5 min-w-0 truncate text-xs">{children}</div>}
    </div>
  );
}
