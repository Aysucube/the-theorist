import type { Metadata } from "next";
import { BinderView } from "@/components/binder/binder-view";

export const metadata: Metadata = {
  title: "Binder",
};

// The collection is stored in the visitor's browser, so everything renders on the client.
export default function BinderPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-12 sm:px-6">
      <BinderView />
    </main>
  );
}
