"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeck } from "@/lib/use-deck";

const LINKS = [
  { href: "/binder", label: "Binder" },
  { href: "/decks", label: "Decks" },
  { href: "/deck", label: "Synergy" },
  { href: "/shopping", label: "Shopping" },
];

/**
 * The site header: a translucent bar that content scrolls under, the name on
 * the left and plain-text links on the right, the current page in ink.
 */
export function SiteNav() {
  const pathname = usePathname();
  const { deck, ready } = useDeck();
  const shopping = deck.reduce((sum, c) => sum + c.qty, 0);
  const active = (href: string) => (href === "/deck" ? pathname === "/deck" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-background/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span aria-hidden className="size-2 rounded-full bg-accent" />
          The Theorist
        </Link>
        <nav aria-label="Main" className="-mr-2 flex items-center gap-0.5 overflow-x-auto text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active(link.href) ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors duration-150 ${
                active(link.href) ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {link.label}
              {link.href === "/shopping" && ready && shopping > 0 && (
                <span className="rounded-full bg-foreground px-1.5 text-[11px] leading-4 font-medium text-background tabular-nums">
                  {shopping}
                  <span className="sr-only"> cards</span>
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
