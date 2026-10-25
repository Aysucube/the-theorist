import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketTrendsSection } from "@/components/market-trends";
import { PanelSkeleton } from "@/components/panel";
import { PageHeader } from "@/components/theme/page-header";
import { PageTransition } from "@/components/theme/page-transition";

export const metadata: Metadata = {
  title: "Market",
};

// The trends and the price history stream in; the header shows at once.
export default function MarketPage() {
  return (
    <PageTransition>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
        <PageHeader
          feature="market"
          eyebrow="Price trends"
          description="The cards whose market price jumped the most lately, in pesos at today’s exchange rate, and what the cheapest copy costs in Philippine stores right now."
        />
        <Suspense fallback={<PanelSkeleton title="Loading price trends…" />}>
          <MarketTrendsSection />
        </Suspense>
      </main>
    </PageTransition>
  );
}
