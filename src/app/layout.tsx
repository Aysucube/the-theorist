import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import { SiteNav } from "@/components/site-nav";
import { Backdrop } from "@/components/theme/backdrop";
import { CastEffects } from "@/components/theme/cast-effects";
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

export const viewport: Viewport = {
  themeColor: "#060a14",
  colorScheme: "dark",
  // Lets the phone tab bar pad itself clear of the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* On phones the tab bar sits along the bottom, so the page keeps clear of it. */}
      <body className="flex min-h-full flex-col overflow-x-clip pb-[calc(4rem+env(safe-area-inset-bottom))] font-sans sm:pb-0">
        <Backdrop />
        <SiteNav />
        {children}
        <CastEffects />
        <Toaster
          theme="dark"
          position="bottom-center"
          mobileOffset={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
          toastOptions={{ className: "font-sans" }}
          style={
            {
              "--normal-bg": "var(--surface)",
              "--normal-border": "var(--line-strong)",
              "--normal-text": "var(--foreground)",
            } as CSSProperties
          }
        />
      </body>
    </html>
  );
}
