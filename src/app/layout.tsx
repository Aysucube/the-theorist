import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ShoppingLink } from "@/components/deck-buttons";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "The Theorist",
    template: "%s · The Theorist",
  },
  description:
    "Find EDHREC card recommendations for your Commander and see what they cost at Philippine game stores.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-6 sm:px-6">
          <Link
            href="/"
            className="text-sm font-medium tracking-wider text-amber-600 uppercase dark:text-amber-400"
          >
            The Theorist
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/deck"
              className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm font-medium whitespace-nowrap hover:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950"
            >
              Deck Synergy
              <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-900 uppercase dark:bg-violet-950 dark:text-violet-300">
                Beta
              </span>
            </Link>
            <ShoppingLink />
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
