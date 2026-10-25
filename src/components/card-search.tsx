"use client";

import Form from "next/form";
import { useEffect, useId, useState } from "react";
import { moveHighlight, splitMatch } from "@/lib/combobox";
import { useAppRouter } from "./app-link";
import { GameChangerTag } from "./game-changer-tag";

// Matches AUTOCOMPLETE_MIN_LENGTH in lib/sources/scryfall.ts (a server-only module).
const MIN_LENGTH = 2;
// Wait for a short pause in typing before asking for suggestions.
const DEBOUNCE_MS = 150;

export function CardSearch({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useAppRouter();
  // Generated ids: Next keeps the previous page mounted (hidden) for instant back
  // navigation, so two search boxes can be in the document at once.
  const inputId = useId();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // Only suggest after the user types, not for a box prefilled with the current search.
  const [typed, setTyped] = useState(false);

  const query = value.trim();
  const active = typed && query.length >= MIN_LENGTH;
  const visible = active ? suggestions : [];
  const showList = open && visible.length > 0;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const { names } = (await res.json()) as { names: string[] };
        setSuggestions(names);
        setHighlight(-1);
      } catch {
        // Aborted by newer typing, or offline: the box still works without suggestions.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, query]);

  function choose(name: string) {
    setValue(name);
    setTyped(false);
    setOpen(false);
    setHighlight(-1);
    router.push(`/card?q=${encodeURIComponent(name)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (visible.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => moveHighlight(h, e.key === "ArrowDown" ? "down" : "up", visible.length));
    } else if (e.key === "Enter" && showList && highlight >= 0) {
      e.preventDefault();
      choose(visible[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <Form
      action="/card"
      className="flex w-full gap-2"
      onSubmit={(e) => {
        setOpen(false);
        // With JavaScript, search through the router so the page transition plays.
        if (!query) return;
        e.preventDefault();
        choose(query);
      }}
    >
      <div className="relative min-w-0 flex-1">
        <label htmlFor={inputId} className="sr-only">
          Card name
        </label>
        <input
          id={inputId}
          name="q"
          type="search"
          required
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setTyped(true);
            setOpen(true);
            setHighlight(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="Search a card, e.g. Sol Ring or Atraxa"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && highlight >= 0 ? `${listId}-${highlight}` : undefined}
          className="h-12 w-full rounded-xl border border-line-strong bg-surface/80 px-4 text-base backdrop-blur outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/70 focus:border-accent/60 focus:ring-4 focus:ring-accent/15"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Card name suggestions"
          hidden={!showList}
          className="pop-in absolute top-full right-0 left-0 z-20 mt-1.5 max-h-80 overflow-auto rounded-xl border border-line-strong bg-surface py-1 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7),0_0_32px_-12px_rgb(90_176_255/0.3)]"
        >
          {visible.map((name, i) => {
            const parts = splitMatch(name, query);
            return (
              <li
                key={name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === highlight}
                // The bold split can make assistive tech read the name in pieces.
                aria-label={name}
                // Keep focus in the text box so the list doesn't close before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(name)}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-4 py-2 text-sm ${
                  i === highlight ? "bg-accent/12 text-foreground" : ""
                }`}
              >
                {parts ? (
                  <>
                    {parts[0]}
                    <strong className="font-semibold">{parts[1]}</strong>
                    {parts[2]}
                  </>
                ) : (
                  name
                )}
                <GameChangerTag name={name} className="ml-2" />
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="submit"
        className="btn btn-primary h-12 rounded-xl px-5"
      >
        Search
      </button>
    </Form>
  );
}
