import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { DeckLink } from "@/components/deck-buttons";
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
    default: "Commander PH",
    template: "%s · Commander PH",
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
            Commander PH
          </Link>
          <DeckLink />
        </header>
        {children}
      </body>
    </html>
  );
}
