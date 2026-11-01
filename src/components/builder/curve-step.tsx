"use client";

import { CurveChart } from "@/components/deck-beta/template-bits";
import type { CurveCut, CurveSlot } from "@/lib/builder/plan";
import { CURVE_LABELS, type CurveReport } from "@/lib/deck-beta/curve";
import { useHoverPreview } from "../card-link";
import { LazyCardImage } from "../deck-beta/lazy-card-image";
import { GameChangerTag } from "../game-changer-tag";

/**
 * 7. Mana curve: the deck's curve held against the average deck's, with the
 * cards to cut at each mana value that's over, the weakest first, and a way
 * back to Build for the ones that are short.
 */
export function CurveStep({
  curve,
  slots,
  averageTarget,
  usesEdhrec,
  themeName,
  total,
  ownedFor,
  onRemove,
  onFind,
}: {
  curve: CurveReport;
  slots: CurveSlot[];
  /** The average mana value of the curve it's aiming for. */
  averageTarget?: number;
  /** The target is EDHREC's average deck, not the template's low, wide curve. */
  usesEdhrec: boolean;
  themeName?: string;
  /** Cards in the deck so far. */
  total: number;
  ownedFor: (name: string) => number;
  onRemove: (name: string) => void;
  /** Back to Build, for cards at this mana value. */
  onFind: (slot: number) => void;
}) {
  const over = slots.filter((s) => s.have > s.target).sort((a, b) => b.have - b.target - (a.have - a.target) || b.slot - a.slot);
  const under = slots.filter((s) => s.have < s.target);
  const toCut = over.reduce((sum, s) => sum + s.have - s.target, 0);
  const source = usesEdhrec ? `the average ${themeName ? `${themeName} deck` : "deck for this commander"} on EDHREC` : "a low, wide curve";

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted">
          Each bar is your deck; each dashed line is {source}, scaled to your spells.
          {averageTarget !== undefined && curve.spells > 0 && ` Your spells average ${curve.average.toFixed(1)} mana, against ${averageTarget.toFixed(1)}.`}
        </p>
        <CurveChart curve={{ ...curve, targets: slots.map((s) => s.target) }} />
      </div>

      {over.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm">
          {curve.spells === 0 ? "Add some spells in Build, then come back to refine the curve." : "Nothing to cut: no mana value is over its line."}
        </p>
      ) : (
        <p className="text-sm">
          <span className="font-medium tabular-nums">{toCut}</span> {toCut === 1 ? "card" : "cards"} over the line. The weakest come first at each cost: low synergy, and no job the deck still needs.
        </p>
      )}

      {over.map((slot) => (
        <section key={slot.slot} className="reveal-fast flex flex-col gap-4">
          <div>
            <h3 className="font-semibold">
              {CURVE_LABELS[slot.slot]} mana
              <span className="ml-2 text-sm font-normal text-muted tabular-nums">
                {slot.have} of {slot.target}, {slot.have - slot.target} to cut
              </span>
            </h3>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
            {slot.cards.map((cut, i) => (
              <CutCard key={cut.card.name} cut={cut} suggested={i < slot.have - slot.target} owned={ownedFor(cut.card.name) > 0} onRemove={onRemove} />
            ))}
          </ul>
        </section>
      ))}

      {under.length > 0 && curve.spells > 0 && (
        <section className="flex flex-col gap-3 border-t border-line pt-6">
          <div>
            <h3 className="font-semibold">Room to fill</h3>
            <p className="text-sm text-muted">
              Cuts leave gaps, and the deck has {total} of 100 cards. These costs are under their line, so that’s where to add.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {under.map((slot) => (
              <li key={slot.slot}>
                <button type="button" onClick={() => onFind(slot.slot)} className="pill">
                  {CURVE_LABELS[slot.slot]} mana
                  <span className="text-[11px] tabular-nums opacity-60">{slot.target - slot.have} short</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A spell in the deck, with why to cut it and a button to do it. */
function CutCard({ cut, suggested, owned, onRemove }: { cut: CurveCut; suggested: boolean; owned: boolean; onRemove: (name: string) => void }) {
  const { card, why } = cut;
  const { trigger, preview } = useHoverPreview(card.name);
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <span {...trigger} tabIndex={0} className={`relative block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-subtle outline-offset-4 ${suggested ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}>
        <span className={`block h-full ${owned ? "" : "opacity-55 grayscale"}`}>
          <LazyCardImage url={card.imageUrl} alt={card.name} />
        </span>
        <GameChangerTag name={card.name} className="absolute top-1.5 left-1.5 shadow" />
      </span>
      {preview}
      <div className="min-w-0 px-0.5">
        <p className="truncate text-[13px] leading-tight font-medium" title={card.name}>
          {card.name}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          {suggested && <span className="text-accent">Cut first · </span>}
          {why}
        </p>
      </div>
      <button type="button" onClick={() => onRemove(card.name)} aria-label={`Remove ${card.name} from the deck`} className="btn btn-secondary btn-sm">
        Remove
      </button>
    </li>
  );
}
