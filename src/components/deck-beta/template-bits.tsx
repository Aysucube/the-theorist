"use client";

import type { EdhrecArticle } from "@/lib/sources/edhrec-articles";
import { CURVE_LABELS, type CurveReport } from "@/lib/deck-beta/curve";
import type { GamePlan } from "@/lib/deck-beta/game-plan";
import { CATEGORIES, CATEGORY_INFO, type Category, type DeckProfile } from "@/lib/deck-beta/roles";
import { formatCount, formatDate } from "@/lib/format";
import { useHoverPreview } from "../card-link";
import { GameChangerTag } from "../game-changer-tag";

/** One color per template category, for meters and tags. */
export const CATEGORY_COLORS: Record<Category, string> = {
  ramp: "#10b981",
  advantage: "#38bdf8",
  targeted: "#f43f5e",
  mass: "#f59e0b",
  plan: "#a78bfa",
};

/** The flexibility tag: shown only on cards that fill two or more categories, naming them. */
export function FlexTag({ categories, compact = false }: { categories: Category[]; compact?: boolean }) {
  if (categories.length < 2) return null;
  const names = categories.map((c) => CATEGORY_INFO[c].label);
  return (
    <span
      title={`Flexible: ${names.join(" + ")}`}
      className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 text-[11px] leading-4 font-medium text-accent"
    >
      <span aria-hidden className="flex gap-0.5">
        {categories.map((c) => (
          <span key={c} className="size-1.5 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
        ))}
      </span>
      {compact ? `Flexible ×${categories.length}` : `Flexible: ${names.join(" + ")}`}
    </span>
  );
}

function Bar({ have, target, color }: { have: number; target: number; color: string }) {
  return (
    <span className="relative block h-2 overflow-hidden rounded-full bg-subtle">
      <span
        className="block h-full origin-left rounded-full transition-transform duration-300 ease-out"
        style={{ transform: `scaleX(${Math.min(1, target ? have / target : 0)})`, background: color }}
      />
    </span>
  );
}

/** A card name that opens the card (and previews on hover). */
export function CardName({ name, onOpen, className = "" }: { name: string; onOpen?: (name: string) => void; className?: string }) {
  const { trigger, preview } = useHoverPreview(name);
  return (
    <>
      <button
        type="button"
        {...trigger}
        onClick={() => {
          trigger.onClick();
          onOpen?.(name);
        }}
        className={`inline-flex items-center gap-1.5 rounded-md border border-line bg-background px-2 py-0.5 text-xs hover:border-accent/50 ${className}`}
      >
        {name}
        <GameChangerTag name={name} compact />
      </button>
      {preview}
    </>
  );
}

/**
 * The deck against the template: lands (by its curve) and each category, with
 * the cards in it a click away.
 */
export function TemplateMeters({ profile, onOpen }: { profile: DeckProfile; onOpen?: (name: string) => void }) {
  const flexible = new Map(profile.flexible.map((f) => [f.name, f.categories]));
  const rows = [
    { key: "lands", label: "Lands", have: profile.lands, target: profile.curve.lands.count, color: "#8d9bb8", names: [] as string[], about: profile.curve.lands.why },
    ...CATEGORIES.map((c) => ({
      key: c,
      label: CATEGORY_INFO[c].label,
      have: profile.categories[c].length,
      target: CATEGORY_INFO[c].target,
      color: CATEGORY_COLORS[c],
      // Flexible cards first: they're the ones doing double duty.
      names: [...profile.categories[c]].sort((a, b) => (flexible.get(b)?.length ?? 0) - (flexible.get(a)?.length ?? 0) || a.localeCompare(b)),
      about: CATEGORY_INFO[c].about,
    })),
  ];
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => {
        const row = (
          <span className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-3 text-sm" title={r.about}>
            <span className="truncate text-foreground/85">{r.label}</span>
            <Bar have={r.have} target={r.target} color={r.color} />
            <span className="text-right tabular-nums">
              <span className={`font-semibold ${r.have >= r.target ? "text-foreground" : ""}`}>{formatCount(r.have)}</span>
              <span className="text-muted"> / {r.target}</span>
            </span>
          </span>
        );
        return (
          <li key={r.key}>
            {r.names.length === 0 ? (
              <div className="py-1 pl-4">{row}</div>
            ) : (
              <details className="group">
                <summary className="cursor-pointer list-none rounded-md py-1 pl-4 hover:bg-subtle [&::-webkit-details-marker]:hidden">
                  <span className="relative block">
                    <span aria-hidden className="absolute top-1/2 -left-3.5 -translate-y-1/2 text-[10px] text-muted transition-transform group-open:rotate-90">
                      ▶
                    </span>
                    {row}
                  </span>
                </summary>
                <p className="pt-1 pl-4 text-xs text-muted">{r.about}</p>
                <div className="flex flex-wrap gap-1.5 pt-1.5 pb-2 pl-4">
                  {r.names.map((name) => (
                    <CardName key={name} name={name} onOpen={onOpen} />
                  ))}
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The spells by mana value against a low, wide curve: bars for the deck, a
 * tick for the target, with the average, the early plays and the land count.
 */
export function CurveChart({ curve, compact = false }: { curve: CurveReport; compact?: boolean }) {
  const top = Math.max(1, ...curve.counts, ...curve.targets);
  const height = compact ? 56 : 112;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-6 items-end gap-2" style={{ height }} role="img" aria-label={`Mana curve: ${curve.counts.map((n, i) => `${n} at ${CURVE_LABELS[i]}`).join(", ")}`}>
        {curve.counts.map((n, i) => {
          const over = i >= 4 && n > curve.targets[i];
          return (
            <div key={i} className="relative flex h-full flex-col justify-end">
              <span
                className={`block w-full origin-bottom rounded-t-md transition-transform duration-300 ease-out ${over ? "bg-amber-400/80" : "bg-accent/80"}`}
                style={{ height: "100%", transform: `scaleY(${n / top})` }}
              />
              <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-foreground/50" style={{ bottom: `${(curve.targets[i] / top) * 100}%` }} />
              {!compact && <span className="absolute inset-x-0 -top-5 text-center text-xs font-semibold tabular-nums">{n}</span>}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-6 gap-2 text-center text-[11px] text-muted">
        {CURVE_LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {!compact && (
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Average mana value</dt>
            <dd className={`font-semibold tabular-nums ${curve.topHeavy ? "text-amber-400" : ""}`}>{curve.spells ? curve.average.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Plays at 2 or less</dt>
            <dd className="font-semibold tabular-nums">
              {formatCount(curve.early)} <span className="font-normal text-muted">/ {curve.earlyTarget}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Lands for this curve</dt>
            <dd className="font-semibold tabular-nums">{curve.lands.count}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** What the curve says, in a line: top-heavy, short of early plays, or in good shape. */
export function curveAdvice(curve: CurveReport): string {
  if (curve.spells === 0) return "Add spells to see the curve.";
  if (curve.topHeavy) return `Top-heavy: spells average ${curve.average.toFixed(1)} mana. Swap a few of the 5+ drops for cheap ramp and card draw, so you can cast two spells a turn.`;
  if (curve.early < curve.earlyTarget) return `${formatCount(curve.earlyTarget - curve.early)} more plays at 2 mana or less would fill your early turns and let you double-spell.`;
  return `A low curve: plenty to cast early, and two spells a turn soon after. ${curve.lands.why}`;
}

/**
 * The commander's game plan: what it does and wants, how players build it on
 * EDHREC, what the 99 should hold, how this deck lines up, and EDHREC's
 * articles about it for more.
 */
export function GamePlanCard({
  plan,
  inDeck,
  articles,
  edhrecUrl,
  loading,
}: {
  plan: GamePlan;
  /** The deck's cards for the plan, when there's a deck. */
  inDeck?: { enablers: string[]; payoffs: string[] };
  articles?: EdhrecArticle[];
  edhrecUrl?: string;
  loading?: boolean;
}) {
  return (
    <section className="surface reveal flex flex-col gap-4 rounded-2xl p-5 sm:p-6">
      <div>
        <p className="eyebrow">Game plan</p>
        <h3 className="mt-1 text-lg font-semibold">What {plan.commander.split(",")[0]} wants</h3>
      </div>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground/90">
        {plan.summary.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {plan.playstyles.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {plan.playstyles.map((p) => (
            <li key={p.slug} className="rounded-full border border-line bg-background px-2.5 py-1 text-xs">
              {p.name} <span className="text-muted tabular-nums">· {Math.round(p.share * 100)}% of decks</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground/85 marker:text-accent">
        {plan.focus.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {inDeck && (
        <p className="rounded-lg bg-subtle px-3 py-2 text-sm">
          In this deck: <strong className="tabular-nums">{formatCount(inDeck.enablers.length)}</strong> enablers and{" "}
          <strong className="tabular-nums">{formatCount(inDeck.payoffs.length)}</strong> payoffs for the plan
          {plan.role === "payoff" && inDeck.enablers.length < 15 ? ". A payoff commander wants more enablers." : "."}
        </p>
      )}
      {(articles?.length || edhrecUrl || loading) && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Further reading from EDHREC</p>
          {loading && !articles?.length && <p className="text-xs text-muted">Looking for articles…</p>}
          <ul className="flex flex-col gap-2">
            {articles?.map((a) => (
              <li key={a.url} className="text-sm">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="link font-medium">
                  {a.title} ↗
                </a>
                <span className="block text-xs text-muted">
                  {a.date && `${formatDate(a.date)} · `}
                  {a.excerpt}
                </span>
              </li>
            ))}
            {edhrecUrl && (
              <li className="text-sm">
                <a href={edhrecUrl} target="_blank" rel="noopener noreferrer" className="link">
                  Its page on EDHREC: every playstyle and card ↗
                </a>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
