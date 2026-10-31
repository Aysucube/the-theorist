import type { SVGProps } from "react";

/** Small line icons drawn for The Theorist (20px grid, 1.6px strokes, currentColor). */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 9.2 10 3.8l6.5 5.4" />
      <path d="M5.2 8v8.2h9.6V8" />
      <path d="M8.4 16.2v-4.4h3.2v4.4" />
    </Icon>
  );
}

/** A binder: a cover with sleeves (the collection). */
export function BinderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="2.8" width="12" height="14.4" rx="1.8" />
      <path d="M7 2.8v14.4" />
      <rect x="9.3" y="6" width="4.2" height="5.6" rx="0.7" />
    </Icon>
  );
}

/** Decks: three cards fanned. */
export function DecksIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.6" y="3.2" width="8.4" height="12" rx="1.3" transform="rotate(12 10.8 9.2)" />
      <rect x="4.6" y="4.4" width="8.4" height="12" rx="1.3" />
    </Icon>
  );
}

/** Synergy: a small network around a center. */
export function SynergyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.2" />
      <circle cx="4.2" cy="5" r="1.4" />
      <circle cx="15.8" cy="4.6" r="1.4" />
      <circle cx="15.6" cy="15.2" r="1.4" />
      <circle cx="4.4" cy="15.4" r="1.4" />
      <path d="m5.3 6 3.1 2.6M14.7 5.6l-3.2 3M14.5 14.2l-3-2.7M5.5 14.4l3-2.8" />
    </Icon>
  );
}

export function ShoppingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.2 6.6h11.6l-1 10H5.2z" />
      <path d="M7.4 8.6V5.8a2.6 2.6 0 0 1 5.2 0v2.8" />
    </Icon>
  );
}

/** Market: a price line climbing, with an arrowhead. */
export function MarketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 15.5h13" />
      <path d="m4.5 12.5 3.6-3.8 2.8 2.4 4.6-5.3" />
      <path d="M12.6 5.8h2.9v2.9" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8.8" cy="8.8" r="5.2" />
      <path d="m12.8 12.8 3.8 3.8" />
    </Icon>
  );
}

/** Create: a card with a plus. */
export function CreateIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.6" y="2.8" width="10.8" height="14.4" rx="1.6" />
      <path d="M10 7.2v5.6M7.2 10h5.6" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10h11.5M11 5.5 15.5 10 11 14.5" />
    </Icon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 7.5 5 5 5-5" />
    </Icon>
  );
}
