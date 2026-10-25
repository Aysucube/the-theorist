import { formatCount, formatUsd } from "@/lib/format";
import type { ScryfallLookup } from "@/lib/types";
import { AddToDeckButton } from "./deck-buttons";
import { ArtBackground, CardImage } from "./card-display";
import { CardLink } from "./card-link";

export function CardOverview({ lookup }: { lookup: ScryfallLookup }) {
  const { card, alternatives } = lookup;

  return (
    <section className="grid gap-6 text-foreground sm:grid-cols-[minmax(0,240px)_1fr]">
      <ArtBackground name={card.name} artUrl={card.artUrl} />
      <CardImage name={card.name} imageUrl={card.imageUrl} />

      <div className="flex min-w-0 flex-col gap-3 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{card.name}</h1>
          <p className="mt-1 text-foreground/80">
            {card.typeLine}
            {card.manaCost && <span className="ml-2 font-mono text-sm">{card.manaCost}</span>}
          </p>
        </div>

        {card.oracleText && (
          <p className="whitespace-pre-line text-sm leading-6">{card.oracleText}</p>
        )}

        <ul className="flex flex-wrap gap-2 text-xs font-medium [text-shadow:none]">
          <Badge tone={card.commanderLegal ? "good" : "bad"}>
            {card.commanderLegal ? "Legal in Commander" : "Not legal in Commander"}
          </Badge>
          {card.canBeCommander && <Badge tone="accent">Can be your commander</Badge>}
          {card.gameChanger && (
            <Badge tone="gc">
              <span title="Brackets 1 and 2 allow no Game Changers; Bracket 3 allows up to three.">Game Changer</span>
            </Badge>
          )}
          {card.edhrecRank && <Badge>EDHREC rank #{formatCount(card.edhrecRank)}</Badge>}
          {card.priceUsd !== undefined && (
            <Badge>{formatUsd(card.priceUsd)} on Scryfall (US market)</Badge>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-4 [text-shadow:none]">
          <AddToDeckButton name={card.name} />
          <a
            href={card.scryfallUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm link text-white"
          >
            View on Scryfall ↗
          </a>
        </div>

        {alternatives.length > 0 && (
          <div className="mt-2 text-sm">
            <p className="text-foreground/80">Not the card you meant? Other matches:</p>
            <ul className="mt-1 flex flex-wrap gap-2 [text-shadow:none]">
              {alternatives.map((name) => (
                <li key={name}>
                  <CardLink
                    name={name}
                    className="inline-block rounded-full border border-line-strong bg-background/60 px-3 py-1 backdrop-blur hover:border-accent/50"
                  />
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
  tone?: "neutral" | "good" | "bad" | "accent" | "gc";
  children: React.ReactNode;
}) {
  // The badges sit on the darkened artwork.
  const tones = {
    neutral: "bg-subtle/90 text-foreground/90 ring-1 ring-line-strong",
    good: "bg-emerald-950 text-emerald-300",
    bad: "bg-red-950 text-red-300",
    accent: "bg-accent/15 text-accent ring-1 ring-accent/30",
    gc: "bg-rose-600 text-white",
  };
  return <li className={`rounded-full px-2.5 py-1 ${tones[tone]}`}>{children}</li>;
}
