/**
 * The Theorist's mark: an original arcane sigil. Rune and tick rings around an
 * eight-pointed star, with a diamond "mind's eye" at the center. With `turn`,
 * the rune ring and the star drift in opposite directions (very slowly; still
 * for anyone who prefers reduced motion).
 */
const GLYPHS = [
  "M-3 -4H3M0 -4V4M-3 4H3",
  "M-3 -4L0 0L3 -4M0 0V4",
  "M-3 4L0 -4L3 4M-1.5 1H1.5",
  "M-3 -3L3 3M3 -3L-3 3",
  "M0 -4V4M-3 -1L0 -4L3 -1",
  "M-3 -4V4M-3 0H3M3 -4V4",
];
const RUNES = 12;
const TICKS = 48;

export function Sigil({ className = "", turn = false }: { className?: string; turn?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden className={className}>
      <defs>
        <radialGradient id="sigil-eye" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e6f7ff" />
          <stop offset="45%" stopColor="#8fdcff" />
          <stop offset="100%" stopColor="#2f7df6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="100" cy="100" r="94" strokeOpacity="0.35" />
        <g strokeOpacity="0.45">
          {Array.from({ length: TICKS }, (_, i) => {
            const long = i % 4 === 0;
            return (
              <line
                key={i}
                x1="100"
                y1={long ? 7 : 9}
                x2="100"
                y2="13"
                strokeWidth={long ? 1.4 : 0.8}
                transform={`rotate(${(360 / TICKS) * i} 100 100)`}
              />
            );
          })}
        </g>
        <g className={turn ? "sigil-turn" : undefined} strokeOpacity="0.7" strokeWidth="1.1">
          <circle cx="100" cy="100" r="80" strokeOpacity="0.4" strokeDasharray="1 5" />
          {Array.from({ length: RUNES }, (_, i) => (
            <path key={i} d={GLYPHS[i % GLYPHS.length]} transform={`rotate(${(360 / RUNES) * i} 100 100) translate(100 21)`} />
          ))}
        </g>
        <circle cx="100" cy="100" r="68" strokeOpacity="0.5" />
        <g className={turn ? "sigil-turn-back" : undefined} strokeOpacity="0.55" strokeWidth="1">
          <rect x="58" y="58" width="84" height="84" />
          <rect x="58" y="58" width="84" height="84" transform="rotate(45 100 100)" />
        </g>
        <path d="M100 52A48 48 0 0 1 148 100M100 148A48 48 0 0 1 52 100" strokeOpacity="0.35" strokeDasharray="2 4" />
        <path d="M100 66L130 100L100 134L70 100Z" strokeOpacity="0.9" strokeWidth="1.4" fill="currentColor" fillOpacity="0.06" />
        <path d="M100 82L115 100L100 118L85 100Z" strokeOpacity="0.8" />
      </g>
      <circle cx="100" cy="100" r="12" fill="url(#sigil-eye)" />
      <circle cx="100" cy="100" r="3.2" fill="#f2fbff" />
    </svg>
  );
}
