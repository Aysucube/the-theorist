import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">There’s nothing at this address.</p>
      <Link href="/" className="text-amber-700 hover:underline dark:text-amber-400">
        Search for a card →
      </Link>
    </main>
  );
}
