/**
 * Behind every page: midnight with a faint blue light from above, a "thought
 * lattice" of points and threads (like the synergy networks), and a little
 * grain. Fixed and still, so scrolling and page transitions stay cheap.
 */

// A tile of the lattice: points and the threads between near neighbours.
const POINTS: [number, number][] = [
  [24, 38], [96, 14], [170, 52], [238, 22], [300, 70],
  [58, 118], [138, 104], [212, 138], [286, 160],
  [18, 196], [92, 214], [166, 236], [248, 222], [312, 262],
  [52, 292], [130, 300], [204, 286], [270, 312],
];
const THREADS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 6], [2, 7], [3, 7], [4, 8], [5, 6], [6, 7], [7, 8],
  [5, 9], [5, 10], [6, 10], [6, 11], [7, 11], [7, 12], [8, 12], [8, 13], [9, 10], [10, 11], [11, 12], [12, 13],
  [9, 14], [10, 14], [10, 15], [11, 15], [11, 16], [12, 16], [12, 17], [13, 17], [14, 15], [15, 16], [16, 17],
];
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(70% 55% at 50% -12%, rgb(47 125 246 / 0.24), transparent 70%)",
            "radial-gradient(40% 35% at 100% 18%, rgb(90 176 255 / 0.08), transparent 70%)",
            "radial-gradient(45% 40% at 0% 85%, rgb(47 125 246 / 0.07), transparent 70%)",
          ].join(", "),
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ maskImage: "radial-gradient(80% 65% at 50% 0%, black, transparent 80%)" }}
      >
        <defs>
          <pattern id="theorist-lattice" width="330" height="330" patternUnits="userSpaceOnUse">
            <g stroke="#5ab0ff" strokeOpacity="0.09" strokeWidth="0.75">
              {THREADS.map(([a, b]) => (
                <line key={`${a}-${b}`} x1={POINTS[a][0]} y1={POINTS[a][1]} x2={POINTS[b][0]} y2={POINTS[b][1]} />
              ))}
            </g>
            <g fill="#8fdcff" fillOpacity="0.32">
              {POINTS.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={i % 5 === 0 ? 1.6 : 1} />
              ))}
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#theorist-lattice)" />
      </svg>
      <div className="absolute inset-0 opacity-[0.045] mix-blend-overlay" style={{ backgroundImage: NOISE }} />
    </div>
  );
}
