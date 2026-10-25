import { AppLink as Link } from "@/components/app-link";
import { PageTransition } from "@/components/theme/page-transition";
import { Sigil } from "@/components/theme/sigil";

export default function NotFound() {
  return (
    <PageTransition>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-4 px-4 py-16 sm:px-6">
        <Sigil turn className="size-24 text-accent/70" />
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted">There’s nothing at this address. Not even an illusion.</p>
        <Link href="/" className="btn btn-primary">
          Search for a card
        </Link>
      </main>
    </PageTransition>
  );
}
