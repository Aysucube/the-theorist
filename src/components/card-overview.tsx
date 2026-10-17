import Image from "next/image";
import Link from "next/link";
import { cardHref, formatCount, formatUsd } from "@/lib/format";
import type { ScryfallLookup } from "@/lib/types";
import { AddToDeckButton } from "./deck-buttons";

export function CardOverview({ lookup }: { lookup: ScryfallLookup }) {
  const { card, alternatives } = lookup;

  return (
    <section className="grid gap-6 sm:grid-cols-[minmax(0,240px)_1fr]">
      <div className="mx-auto w-full max-w-[240px]">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            width={488}
            height={680}
            priority
            // Scryfall's CDN already serves sized images and rejects the optimizer's requests.
            unoptimized
            className="h-auto w-full rounded-[4.75%] shadow-md"
          />
        ) : (
          <div className="flex aspect-[488/680] items-center justify-center rounded-xl bg-zinc-200 text-sm text-zinc-500 dark:bg-zinc-800">
            No image
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{card.name}</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            {card.typeLine}
            {card.manaCost && <span className="ml-2 font-mono text-sm">{card.manaCost}</span>}
          </p>
        </div>

        {card.oracleText && (
          <p className="whitespace-pre-line text-sm leading-6">{card.oracleText}</p>
        )}

        <ul className="flex flex-wrap gap-2 text-xs font-medium">
          <Badge tone={card.commanderLegal ? "good" : "bad"}>
            {card.commanderLegal ? "Legal in Commander" : "Not legal in Commander"}
          </Badge>
          {card.canBeCommander && <Badge tone="accent">Can be your commander</Badge>}
          {card.edhrecRank && <Badge>EDHREC rank #{formatCount(card.edhrecRank)}</Badge>}
          {card.priceUsd !== undefined && (
            <Badge>{formatUsd(card.priceUsd)} on Scryfall (US market)</Badge>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-4">
          <AddToDeckButton name={card.name} />
          <a
            href={card.scryfallUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-amber-700 hover:underline dark:text-amber-400"
          >
            View on Scryfall ↗
          </a>
        </div>

        {alternatives.length > 0 && (
          <div className="mt-2 text-sm">
            <p className="text-zinc-500">Not the card you meant? Other matches:</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {alternatives.map((name) => (
                <li key={name}>
                  <Link
                    href={cardHref(name)}
                    className="inline-block rounded-full border border-zinc-300 px-3 py-1 hover:border-amber-500 dark:border-zinc-700"
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "bad" | "accent";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    accent: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  };
  return <li className={`rounded-full px-2.5 py-1 ${tones[tone]}`}>{children}</li>;
}
