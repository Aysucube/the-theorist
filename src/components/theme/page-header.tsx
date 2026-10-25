import { ViewTransition, type ReactNode } from "react";
import { FEATURES, morphName, type FeatureId } from "./features";

/**
 * A page's header: the feature's glowing icon, an eyebrow, the title and a
 * line about the page, with actions on the right. The icon and title share
 * view-transition names with the feature's tile on the front page, so opening
 * a tile morphs it into this header.
 */
export function PageHeader({
  feature,
  eyebrow,
  title,
  aside,
  description,
  actions,
  morphTitle = true,
}: {
  feature: FeatureId;
  eyebrow: ReactNode;
  title?: ReactNode;
  /** Shown beside the title (a badge, a status). */
  aside?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Off when the title isn't the feature's name, so it shouldn't morph from the tile's. */
  morphTitle?: boolean;
}) {
  const { Icon } = FEATURES[feature];
  const heading = <h1 className="w-fit text-3xl font-semibold tracking-[-0.03em]">{title ?? FEATURES[feature].title}</h1>;
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex min-w-0 items-start gap-4">
        <ViewTransition name={morphName(feature, "icon")} share="morph" default="none">
          <FeatureBadge Icon={Icon} />
        </ViewTransition>
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            {morphTitle ? (
              <ViewTransition name={morphName(feature, "title")} share="morph" default="none">
                {heading}
              </ViewTransition>
            ) : (
              heading
            )}
            {aside}
          </div>
          {description && <div className="mt-1 max-w-xl text-muted">{description}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A feature's icon in a softly glowing tile. */
export function FeatureBadge({ Icon, size = "md" }: { Icon: (typeof FEATURES)[FeatureId]["Icon"]; size?: "md" | "lg" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center border border-accent/30 bg-accent/10 text-accent shadow-[0_0_24px_-8px_rgb(90_176_255/0.7)] ${
        size === "lg" ? "size-14 rounded-2xl" : "size-12 rounded-[14px]"
      }`}
    >
      <Icon className={size === "lg" ? "size-7" : "size-6"} />
    </span>
  );
}
