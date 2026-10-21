"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import type { DeckCard } from "@/lib/deck";
import { decodeDeck, deckToText, encodeDeck, type DeckToShare } from "@/lib/deck-beta/deck-code";
import { loadWholeDeck, useDeckLibrary, type SavedDeck } from "@/lib/deck-beta/store";
import { formatCount } from "@/lib/format";

const savedDate = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });
const cardCount = (cards: DeckCard[]) => cards.reduce((sum, c) => sum + c.qty, 0);

/** A link that opens Deck Synergy with this deck offered to load. The code rides in the #hash, so it never reaches a server. */
async function shareLink(deck: DeckToShare) {
  return `${window.location.origin}/deck#deck=${await encodeDeck(deck)}`;
}

/**
 * Decks saved in this browser, and ways to take the current one elsewhere:
 * a deck code to paste into The Theorist on another computer, a link, or a
 * plain list for Moxfield and Archidekt.
 */
export function DeckLibrary({ deck, commander }: { deck: DeckCard[]; commander?: string }) {
  const { decks, save, remove } = useDeckLibrary();
  const nameId = useId();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<{ cards: DeckCard[]; commander?: string } | null>(null);
  const deckName = name.trim() || commander || "My deck";
  const current: DeckToShare = { name: deckName, commander, cards: deck };

  function onSave() {
    const replacing = decks.some((d) => d.name.toLowerCase() === deckName.toLowerCase());
    save(deckName, commander, deck);
    setName(deckName);
    setMessage(`${replacing ? "Updated" : "Saved"} “${deckName}”.`);
  }

  function onLoad(saved: SavedDeck) {
    if (deck.length > 0) setUndo({ cards: deck, commander });
    loadWholeDeck(saved.cards, saved.commander);
    setName(saved.name);
    setMessage(`Loaded “${saved.name}”.`);
  }

  return (
    <details open={deck.length === 0 && decks.length > 0} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer px-4 py-3 font-medium">
        Saved decks and sharing
        {decks.length > 0 && <span className="ml-1.5 text-sm font-normal text-zinc-500 tabular-nums">({formatCount(decks.length)})</span>}
      </summary>
      <div className="flex flex-col gap-5 px-4 pb-4">
        {deck.length > 0 && (
          <div className="flex flex-col gap-3">
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onSave();
              }}
            >
              <label htmlFor={nameId} className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                Deck name
                <input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder={commander || "My deck"}
                  className="h-10 min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
              <button type="submit" className="h-10 rounded-lg bg-amber-500 px-4 text-sm font-medium text-zinc-950 hover:bg-amber-400">
                Save deck
              </button>
            </form>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Share this deck:</span>
              <CopyButton label="Copy deck code" text={() => encodeDeck(current)} />
              <CopyButton label="Copy link" text={() => shareLink(current)} />
              <CopyButton label="Copy as list" text={async () => deckToText(current)} />
            </div>
            <p className="text-xs text-zinc-500">
              A deck code holds the whole deck and its commander in one line. Paste it into “Paste a deck list” on any
              copy of The Theorist to load it. The list works on Moxfield, Archidekt and EDHREC.
            </p>
          </div>
        )}

        {(message || undo) && (
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            {message}{" "}
            {undo && (
              <button
                type="button"
                onClick={() => {
                  loadWholeDeck(undo.cards, undo.commander);
                  setUndo(null);
                  setMessage("Put back the deck you had before.");
                }}
                className="text-amber-700 underline dark:text-amber-400"
              >
                Undo
              </button>
            )}
          </p>
        )}

        {decks.length === 0 ? (
          <p className="text-sm text-zinc-500">No saved decks yet. Saved decks stay in this browser.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {decks.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {[d.commander, `${formatCount(cardCount(d.cards))} cards`, `saved ${savedDate.format(d.savedAt)}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLoad(d)}
                  className="h-8 rounded-lg border border-zinc-300 px-3 text-xs font-medium hover:border-amber-500 dark:border-zinc-700"
                >
                  Load
                </button>
                <CopyButton label="Copy code" text={() => encodeDeck(d)} />
                <DeleteButton name={d.name} onDelete={() => remove(d.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function CopyButton({ label, text }: { label: string; text: () => Promise<string> }) {
  const [status, setStatus] = useState<"idle" | "copied" | { manual: string }>("idle");

  async function copy() {
    const value = await text();
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      // Clipboard access can be blocked (some phones, embedded browsers): show the text to copy by hand.
      setStatus({ manual: value });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="h-8 rounded-lg border border-zinc-300 px-3 text-xs font-medium hover:border-amber-500 dark:border-zinc-700"
      >
        <span aria-live="polite">{status === "copied" ? "Copied ✓" : label}</span>
      </button>
      {typeof status === "object" && (
        <label className="w-full text-xs text-zinc-500">
          Couldn’t copy automatically. Select the text below and copy it:
          <textarea
            readOnly
            value={status.manual}
            rows={Math.min(8, status.manual.split("\n").length + 1)}
            ref={(el) => el?.select()}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs break-all text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </label>
      )}
    </>
  );
}

function DeleteButton({ name, onDelete }: { name: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (confirming) onDelete();
        setConfirming(!confirming);
      }}
      onBlur={() => setConfirming(false)}
      aria-label={confirming ? `Click again to delete ${name}` : `Delete ${name}`}
      className={`h-8 rounded-lg border px-3 text-xs ${
        confirming
          ? "border-red-600 text-red-700 dark:text-red-400"
          : "border-zinc-300 text-zinc-600 hover:border-red-500 dark:border-zinc-700 dark:text-zinc-400"
      }`}
    >
      {confirming ? "Click again" : "Delete"}
    </button>
  );
}

// --- Shared links --------------------------------------------------------------

const hashListeners = new Set<() => void>();

function subscribeHash(notify: () => void) {
  hashListeners.add(notify);
  window.addEventListener("hashchange", notify);
  return () => {
    hashListeners.delete(notify);
    window.removeEventListener("hashchange", notify);
  };
}

function clearHash() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
  hashListeners.forEach((notify) => notify());
}

/** When the page was opened from a shared link (/deck#deck=TT1.…), offers to load or save that deck. */
export function SharedDeckBanner() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const code = hash.startsWith("#deck=") ? decodeURIComponent(hash.slice("#deck=".length)) : "";
  const [decoded, setDecoded] = useState<{ code: string; deck: DeckToShare | null }>();
  const { save } = useDeckLibrary();

  useEffect(() => {
    if (!code) return;
    let live = true;
    void decodeDeck(code).then((deck) => {
      if (live) setDecoded({ code, deck });
    });
    return () => {
      live = false;
    };
  }, [code]);

  if (!code || decoded?.code !== code) return null;
  const shared = decoded.deck;
  const box = "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm";
  if (!shared) {
    return (
      <div className={`${box} border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200`}>
        <span className="flex-1">This link’s deck code is damaged, so there’s no deck to load. Ask for the link again.</span>
        <button type="button" onClick={clearHash} className="underline">
          Dismiss
        </button>
      </div>
    );
  }
  const title = shared.name || shared.commander || "A deck";
  return (
    <div className={`${box} border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100`}>
      <span className="min-w-0 flex-1">
        Shared with you: <strong>{title}</strong>
        {shared.commander && shared.commander !== title && <> ({shared.commander})</>} · {formatCount(cardCount(shared.cards))} cards. Loading it
        replaces the deck here.
      </span>
      <button
        type="button"
        onClick={() => {
          loadWholeDeck(shared.cards, shared.commander);
          clearHash();
        }}
        className="h-8 rounded-lg bg-amber-500 px-3 text-xs font-medium text-zinc-950 hover:bg-amber-400"
      >
        Load it
      </button>
      <button
        type="button"
        onClick={() => {
          save(title, shared.commander, shared.cards);
          clearHash();
        }}
        className="h-8 rounded-lg border border-amber-400 px-3 text-xs font-medium hover:border-amber-600 dark:border-amber-700"
      >
        Save for later
      </button>
      <button type="button" onClick={clearHash} className="text-xs underline">
        Dismiss
      </button>
    </div>
  );
}
