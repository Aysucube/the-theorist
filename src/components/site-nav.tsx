"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ComponentType, type SVGProps } from "react";
import { useDeck } from "@/lib/use-deck";
import { AppLink } from "./app-link";
import { BinderIcon, DecksIcon, HomeIcon, MarketIcon, SearchIcon, ShoppingIcon, SynergyIcon } from "./theme/icons";
import { Sigil } from "./theme/sigil";

type Section = { href: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const SECTIONS: Section[] = [
  { href: "/binder", label: "Binder", Icon: BinderIcon },
  { href: "/decks", label: "Decks", Icon: DecksIcon },
  { href: "/deck", label: "Synergy", Icon: SynergyIcon },
  { href: "/market", label: "Market", Icon: MarketIcon },
  { href: "/shopping", label: "Shopping", Icon: ShoppingIcon },
];
const TABBAR: Section[] = [{ href: "/", label: "Home", Icon: HomeIcon }, ...SECTIONS];

/**
 * The site header: the Theorist's sigil and name, and the sections with a lit
 * pill that glides to the current one. On phones the sections move to a tab
 * bar along the bottom, in easy reach of a thumb. Both stay still while pages
 * slide (their view-transition names are anchored in globals.css).
 */
export function SiteNav() {
  const pathname = usePathname();
  const { deck, ready } = useDeck();
  const shopping = ready ? deck.reduce((sum, c) => sum + c.qty, 0) : 0;
  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/card") : href === "/deck" ? pathname === "/deck" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header
        style={{ viewTransitionName: "site-header" }}
        className="sticky top-0 z-40 border-b border-line/70 bg-background/80 backdrop-blur-xl backdrop-saturate-150"
      >
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <AppLink href="/" className="group flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <Sigil className="size-7 text-accent transition-transform duration-500 ease-out group-hover:rotate-45" />
            The Theorist
          </AppLink>
          <DesktopLinks active={active} shopping={shopping} />
          <AppLink
            href="/card"
            aria-label="Search for a card"
            className="-mr-2 flex size-10 items-center justify-center rounded-full text-muted hover:text-foreground sm:hidden"
          >
            <SearchIcon />
          </AppLink>
        </div>
      </header>

      <nav
        aria-label="Sections"
        style={{ viewTransitionName: "site-tabbar" }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
      >
        <ul className="grid grid-cols-6">
          {TABBAR.map(({ href, label, Icon }) => {
            const on = active(href);
            return (
              <li key={href}>
                <AppLink
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors duration-150 ${
                    on ? "text-accent" : "text-muted"
                  }`}
                >
                  <span
                    className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors duration-200 ${
                      on ? "bg-accent/15 shadow-[0_0_14px_-4px_rgb(90_176_255/0.7)]" : ""
                    }`}
                  >
                    <Icon />
                  </span>
                  {label}
                  {href === "/shopping" && shopping > 0 && <Count n={shopping} className="absolute top-2 left-1/2 ml-2.5" />}
                </AppLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function DesktopLinks({ active, shopping }: { active: (href: string) => boolean; shopping: number }) {
  const pathname = usePathname();
  const list = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  // Move the pill under the current link. The first placement doesn't animate.
  useLayoutEffect(() => {
    const place = () => {
      const el = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
      const p = pill.current;
      if (!p) return;
      if (!el) {
        p.style.opacity = "0";
        return;
      }
      p.style.transition = placed.current ? "" : "none";
      p.style.opacity = "1";
      p.style.translate = `${el.offsetLeft}px 0`;
      p.style.width = `${el.offsetWidth}px`;
      placed.current = true;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [pathname, shopping]);

  return (
    <div ref={list} className="relative hidden items-center gap-1 text-sm sm:flex">
      <span
        ref={pill}
        aria-hidden
        className="absolute top-0 left-0 h-full rounded-full border border-accent/40 bg-accent/12 opacity-0 shadow-[0_0_18px_-6px_rgb(90_176_255/0.8)] transition-[translate,width,opacity] duration-250 ease-out"
      />
      {SECTIONS.map(({ href, label, Icon }) => (
        <AppLink
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors duration-150 ${
            active(href) ? "text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          <Icon className={`size-4 ${active(href) ? "text-accent" : ""}`} />
          {label}
          {href === "/shopping" && shopping > 0 && <Count n={shopping} />}
        </AppLink>
      ))}
    </div>
  );
}

function Count({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`rounded-full bg-accent px-1.5 text-[11px] leading-4 font-semibold text-on-accent tabular-nums ${className}`}>
      {n}
      <span className="sr-only"> cards</span>
    </span>
  );
}
