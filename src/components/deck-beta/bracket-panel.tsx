"use client";

import { BRACKET_INFO, BRACKETS, bracketLabel, type Bracket, type BracketPath, type BracketReport } from "@/lib/deck-beta/bracket";
import { formatCount } from "@/lib/format";
import { useHoverPreview } from "../card-link";
import { GameChangerTag } from "../game-changer-tag";
import { BRACKET_STYLE } from "./bracket-badge";

/**
 * The deck's bracket and why, a picker for the bracket to build toward, and
 * what it takes to get there: cuts when the deck is above it, room to grow
 * when it's below.
 */
export function BracketSection({
  report,
  checking,
  target,
  onTarget,
  path,
  onOpen,
}: {
  report: BracketReport;
  /** Commander Spellbook hasn't answered yet, so combos aren't counted. */
  checking: boolean;
  target: Bracket;
  onTarget: (bracket: Bracket) => void;
  path: BracketPath;
  onOpen: (name: string) => void;
}) {
  const info = BRACKET_INFO[target];
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold">Bracket</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${BRACKET_STYLE[report.bracket]}`}>{bracketLabel(report)}</span>
        <span className="text-sm text-muted">
          {BRACKET_INFO[report.bracket].name}
          {report.spellbook && ` · Commander Spellbook says Bracket ${report.spellbook}`}
          {checking && " · still checking combos…"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Why</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.reasons.map((r) => (
              <li key={r.text}>{r.text}</li>
            ))}
          </ul>
          {report.gameChangers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {report.gameChangers.map((name) => (
                <NameChip key={name} name={name} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
        {report.nearing && (
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Close to Bracket {report.nearing}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {report.nearingReasons.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Recommend cards for</p>
        <div role="radiogroup" aria-label="Bracket to build toward" className="flex flex-wrap gap-2">
          {BRACKETS.map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={b === target}
              onClick={() => onTarget(b)}
              className={`rounded-lg border px-3 py-1.5 text-left text-sm ${
                b === target ? "border-accent bg-accent text-on-accent shadow-[0_0_16px_-4px_rgb(90_176_255/0.6)]" : "border-line-strong hover:border-accent/50 "
              }`}
            >
              <span className="font-semibold">Bracket {b}</span> <span className={b === target ? "text-on-accent/70" : "text-muted"}>{BRACKET_INFO[b].name}</span>
              {b === report.bracket && <span className={`ml-1 text-xs ${b === target ? "text-on-accent/70" : "text-muted"}`}>(your deck)</span>}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {info.rules} Games usually last {info.turns}.
          {target === 1 && " Bracket 1 is also about building around a theme rather than winning, which a list can't show."}
          {target === 5 && " Bracket 5 is about intent: a deck tuned to win as fast as possible for a competitive table."}
        </p>
      </div>

      <PathToTarget report={report} path={path} onOpen={onOpen} />
    </section>
  );
}

function PathToTarget({ report, path, onOpen }: { report: BracketReport; path: BracketPath; onOpen: (name: string) => void }) {
  const { target } = path;
  if (path.cuts.length > 0) {
    return (
      <div>
        <p className="text-sm font-medium">To fit Bracket {target}, cut:</p>
        <ul className="mt-2 flex flex-col gap-2">
          {path.cuts.map((group) => (
            <li key={group.why} className="rounded-lg bg-surface p-2.5">
              <p className="text-sm">
                {group.why}{" "}
                <span className="text-muted">
                  {group.cut >= group.cards.length ? (group.cards.length === 1 ? "Cut it." : "Cut them all.") : `Cut ${formatCount(group.cut)} of these.`}
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {group.cards.map((name) => (
                  <NameChip key={name} name={name} onOpen={onOpen} />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">The upgrades below leave out anything above Bracket {target}, so they can fill the gaps the cuts leave.</p>
      </div>
    );
  }
  if (target > report.bracket) {
    const room = path.gameChangerRoom === Infinity ? "as many Game Changers as you like" : `${formatCount(path.gameChangerRoom)} more Game Changer${path.gameChangerRoom === 1 ? "" : "s"}`;
    return (
      <p className="text-sm">
        Your deck already fits Bracket {target}, with room to grow: {room}
        {path.comboLimit >= 4 ? ", fast two-card combos" : ", combos that win late in the game"}
        {path.landDenial ? " and land denial" : ""}. The upgrades below rank stronger cards higher and show the Game Changers there&rsquo;s room for.
      </p>
    );
  }
  return (
    <p className="text-sm">
      Your deck fits Bracket {target}.{" "}
      {report.nearing && report.nearing > target
        ? "It’s close to the next bracket, so the upgrades below leave out cards that would tip it over."
        : "The upgrades below keep it there."}
    </p>
  );
}

function NameChip({ name, onOpen }: { name: string; onOpen: (name: string) => void }) {
  const { trigger, preview } = useHoverPreview(name);
  return (
    <>
      <button
        type="button"
        {...trigger}
        onClick={() => {
          trigger.onClick();
          onOpen(name);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-line bg-background px-2 py-0.5 text-xs hover:border-accent/50"
      >
        {name}
        <GameChangerTag name={name} compact />
      </button>
      {preview}
    </>
  );
}
