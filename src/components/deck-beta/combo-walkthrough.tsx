"use client";

import { useEffect, useMemo, useState } from "react";
import { walkSteps, type WalkStep } from "@/lib/deck-beta/walkthrough";
import type { Combo } from "@/lib/types";
import { HoverName } from "./bits";

/** Seconds per step when playing. */
const STEP_SECONDS = 4.5;

/** A combo walkthrough's state: the steps, which one is showing, and whether it plays by itself. */
export function useWalkthrough(combo: Combo | undefined) {
  const steps = useMemo(() => (combo ? walkSteps(combo) : []), [combo]);
  // The step and play state belong to one combo; picking another starts it from the top.
  const [state, setState] = useState<{ comboId?: string; step: number; playing: boolean }>({ step: 0, playing: false });
  const current = state.comboId === combo?.id ? state : { comboId: combo?.id, step: 0, playing: false };
  const setStep = (step: number) => setState({ comboId: combo?.id, step: Math.max(0, Math.min(steps.length - 1, step)), playing: current.playing });
  const setPlaying = (playing: boolean) => setState({ ...current, comboId: combo?.id, playing });

  useEffect(() => {
    if (!current.playing) return;
    const timer = window.setTimeout(() => {
      setState((s) =>
        s.step + 1 >= steps.length ? { ...s, playing: false } : { ...s, step: s.step + 1 },
      );
    }, STEP_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [current.playing, current.step, steps.length]);

  return { steps, step: current.step, setStep, playing: current.playing, setPlaying };
}

/** The step-by-step explanation shown over the network while it zooms onto a combo. */
export function WalkthroughPanel({
  combo,
  color,
  steps,
  step,
  setStep,
  playing,
  setPlaying,
  onClose,
  floating = true,
}: {
  /** Float over the bottom of the network (big networks), or sit in the page under it (small ones). */
  floating?: boolean;
  combo: Combo;
  color: string;
  steps: WalkStep[];
  step: number;
  setStep: (step: number) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  onClose: () => void;
}) {
  const current = steps[step];
  if (!current) return null;
  const control =
    "h-8 rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:border-amber-500 disabled:opacity-40 dark:border-zinc-700";
  return (
    <div
      role="region"
      aria-label={`How ${combo.results[0] ?? "this combo"} works`}
      className={`rounded-xl border border-zinc-200 bg-white/95 p-3 dark:border-zinc-700 dark:bg-zinc-900/95 ${
        floating ? "absolute inset-x-2 bottom-2 shadow-lg backdrop-blur sm:right-auto sm:max-w-md" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <p className="min-w-0 flex-1 text-sm font-semibold">{combo.results.slice(0, 2).join(" · ") || "Combo"}</p>
        <button type="button" onClick={onClose} aria-label="Stop the walkthrough" className="rounded px-1.5 text-lg leading-none text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ×
        </button>
      </div>

      <p className="mt-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase" aria-live="polite">
        {current.title} · {step + 1} of {steps.length}
      </p>
      <p className="mt-1 max-h-32 overflow-y-auto text-sm leading-6 whitespace-pre-line">{current.text}</p>
      {current.cards.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5" aria-label="Cards in this step">
          {current.cards.map((name) => (
            <HoverName
              key={name}
              name={name}
              className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          ))}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={control} onClick={() => setStep(step - 1)} disabled={step === 0}>
          ‹ Back
        </button>
        <button type="button" className={control} onClick={() => (step + 1 >= steps.length ? setStep(0) : setPlaying(!playing))}>
          {step + 1 >= steps.length ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <button type="button" className={`${control} border-amber-500 bg-amber-500 text-zinc-950 hover:bg-amber-400`} onClick={() => setStep(step + 1)} disabled={step + 1 >= steps.length}>
          Next ›
        </button>
        <span className="ml-auto flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => setStep(i)}
              title={s.title}
              className={`size-2 rounded-full ${i === step ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
            />
          ))}
        </span>
      </div>
      <a href={combo.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-amber-700 hover:underline dark:text-amber-400">
        Commander Spellbook ↗
      </a>
    </div>
  );
}
