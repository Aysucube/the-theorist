"use client";

import { motion, MotionConfig } from "motion/react";
import NumberFlow from "@number-flow/react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCardDetails } from "@/lib/binder/card-cache";
import { parseCollection } from "@/lib/binder/collection";
import { useBinder } from "@/lib/binder/store";
import { parseTypeLine } from "@/lib/deck-beta/synergy";
import { formatCount } from "@/lib/format";
import type { CardDetails } from "@/lib/types";
import { useHoverPreview } from "../card-link";
import { LazyCardImage } from "../deck-beta/lazy-card-image";
import { GameChangerTag } from "../game-changer-tag";
import { Pip } from "../mana";

/** Cards shown before "Show more": a collection can hold thousands. */
const PAGE = 60;
const TYPES = ["All", "Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land"] as const;
const COLORS = ["W", "U", "B", "R", "G", "C"] as const;

/**
 * The Binder: the player's whole collection. Paste a list or a collection
 * export, or upload the file; browse it by color and type. Create Commander
 * Deck builds from it, and My Decks knows what each deck is missing.
 */
export function BinderView() {
  const binder = useBinder();
  const names = binder.cards.map((c) => c.name);
  const { detailsFor, status } = useCardDetails(names);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("All");
  const [colors, setColors] = useState<string[]>([]);
  const [commandersOnly, setCommandersOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  if (!binder.ready) return <p className="text-muted">Loading your binder…</p>;

  const copies = binder.cards.reduce((sum, c) => sum + c.qty, 0);
  const entries = binder.cards.map((c) => ({ ...c, details: detailsFor(c.name) }));
  const commanders = entries.filter((e) => e.details?.canBeCommander).length;
  const q = query.trim().toLowerCase();
  const filtered = entries.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    const d = e.details;
    if (!d) return type === "All" && colors.length === 0 && !commandersOnly;
    if (commandersOnly && !d.canBeCommander) return false;
    if (type !== "All" && !parseTypeLine(d.typeLine).types.has(type)) return false;
    if (colors.length > 0) {
      const colorless = d.colorIdentity.length === 0;
      if (!colors.some((c) => (c === "C" ? colorless : d.colorIdentity.includes(c)))) return false;
    }
    return true;
  });

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-12">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Your collection</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">Binder</h1>
            <p className="mt-1 max-w-lg text-muted">Everything you own, in one place. Decks you create are built from it.</p>
          </div>
          <Link href="/decks/new" className="btn btn-primary btn-lg">
            Create Commander Deck
          </Link>
        </header>

        {binder.cards.length > 0 && (
          <dl className="grid grid-cols-3 gap-6 border-y border-line py-6">
            <Stat label="Cards" value={binder.cards.length} />
            <Stat label="Copies" value={copies} />
            <Stat label="Commanders" value={commanders} />
          </dl>
        )}

        <ImportBox empty={binder.cards.length === 0} onAdd={binder.add} onReplace={binder.replace} />

        {status.state !== "idle" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="spinner size-4" />
            {status.state === "waiting"
              ? `Waiting ${status.seconds}s because ${status.reason}…`
              : `Reading ${formatCount(status.pending)} cards from Scryfall. The first time takes a moment; after that it’s instant.`}
          </p>
        )}

        {binder.cards.length > 0 && (
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="Find a card in your binder"
                aria-label="Find a card in your binder"
                className="field h-10 max-w-sm"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={colors.includes(c)}
                    onClick={() => setColors(colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c])}
                    className="pill"
                    aria-label={c === "C" ? "Colorless" : `Color ${c}`}
                  >
                    {c === "C" ? <span className="text-xs">Colorless</span> : <Pip symbol={c} className="size-[18px] text-[10px]" />}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-line" aria-hidden />
                {TYPES.map((t) => (
                  <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className="pill">
                    {t === "All" ? "All types" : `${t}s`.replace("Sorcerys", "Sorceries")}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-line" aria-hidden />
                <button type="button" aria-pressed={commandersOnly} onClick={() => setCommandersOnly(!commandersOnly)} className="pill">
                  Commanders
                </button>
              </div>
              <p className="text-xs text-muted">
                {formatCount(filtered.length)} of {formatCount(binder.cards.length)} cards
              </p>
            </div>

            <ul className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {filtered.slice(0, shown).map((e, i) => (
                <BinderCard key={e.name} name={e.name} qty={e.qty} details={e.details} index={i % PAGE} onQty={(n) => binder.setQty(e.name, n)} />
              ))}
            </ul>
            {filtered.length > shown && (
              <button type="button" onClick={() => setShown(shown + PAGE * 2)} className="btn btn-secondary self-center">
                Show more ({formatCount(filtered.length - shown)} left)
              </button>
            )}
            <ClearBinder onClear={binder.clear} />
          </section>
        )}
      </div>
    </MotionConfig>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        <NumberFlow value={value} />
      </dd>
    </div>
  );
}

function BinderCard({
  name,
  qty,
  details,
  index,
  onQty,
}: {
  name: string;
  qty: number;
  details: CardDetails | null | undefined;
  index: number;
  onQty: (qty: number) => void;
}) {
  const { trigger, preview } = useHoverPreview(name);
  return (
    <motion.li
      initial={{ opacity: 0, transform: "translateY(6px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: Math.min(index, 12) * 0.025 }}
      className="group min-w-0"
    >
      <div {...trigger} className="relative aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle">
        {details === null ? (
          <span className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted">Scryfall doesn’t know this name</span>
        ) : (
          <LazyCardImage url={details?.imageUrl} alt={name} />
        )}
        <GameChangerTag name={name} compact className="absolute top-1 left-1" />
        {qty > 1 && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-zinc-950/80 px-1.5 text-[11px] font-semibold text-white tabular-nums">×{qty}</span>
        )}
      </div>
      {preview}
      <p className="mt-1.5 truncate text-[12px] font-medium" title={name}>
        {name}
      </p>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <button type="button" onClick={() => onQty(qty - 1)} aria-label={`One fewer ${name}`} className="rounded px-1.5 hover:bg-subtle hover:text-foreground">
          −
        </button>
        <span className="tabular-nums">{qty}</span>
        <button type="button" onClick={() => onQty(qty + 1)} aria-label={`One more ${name}`} className="rounded px-1.5 hover:bg-subtle hover:text-foreground">
          +
        </button>
      </div>
    </motion.li>
  );
}

function ImportBox({ empty, onAdd, onReplace }: { empty: boolean; onAdd: (cards: ReturnType<typeof parseCollection>) => void; onReplace: (cards: ReturnType<typeof parseCollection>) => void }) {
  const id = useId();
  const fileId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(empty);

  function apply(mode: "add" | "replace", source = text) {
    const cards = parseCollection(source);
    if (cards.length === 0) {
      toast.error("No cards found", { description: "Put one card per line (“4 Forest”), or paste a CSV export with a Name column." });
      return;
    }
    (mode === "add" ? onAdd : onReplace)(cards);
    const total = cards.reduce((sum, c) => sum + c.qty, 0);
    toast.success(`${mode === "add" ? "Added" : "Binder replaced with"} ${formatCount(total)} ${total === 1 ? "card" : "cards"}`);
    setText("");
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary">
          Add cards
        </button>
      </div>
    );
  }

  return (
    <section className="surface flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <label htmlFor={id} className="font-semibold">
          {empty ? "Add your collection" : "Add cards"}
        </label>
        <p className="mt-0.5 text-sm text-muted">
          Paste a list (“4 Forest”, “1x Sol Ring (CMM) 410”) or a collection export from ManaBox, Moxfield, Archidekt or Deckbox. Copies of the same card are added up.
        </p>
      </div>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"4 Forest\n1 Sol Ring\n1 Lathril, Blade of the Elves\n\nor a CSV with a Name and a Count column"}
        className="field font-mono text-[13px] leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => apply("add")} disabled={!text.trim()} className="btn btn-primary">
          Add to binder
        </button>
        {!empty && (
          <button type="button" onClick={() => apply("replace")} disabled={!text.trim()} className="btn btn-secondary">
            Replace binder
          </button>
        )}
        <label htmlFor={fileId} className="btn btn-ghost cursor-pointer">
          Upload a file
        </label>
        <input
          id={fileId}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) apply("add", await file.text());
            e.target.value = "";
          }}
        />
        {!empty && (
          <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost text-muted">
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

function ClearBinder({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (confirming) {
          onClear();
          toast("Binder cleared");
        }
        setConfirming(!confirming);
      }}
      onBlur={() => setConfirming(false)}
      className={`btn btn-ghost btn-sm self-start ${confirming ? "text-red-600" : "text-muted"}`}
    >
      {confirming ? "Click again to clear the binder" : "Clear binder"}
    </button>
  );
}
