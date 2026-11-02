// The odds of drawing particular cards: with `hits` of them in a deck of `deck`
// cards, the chance that `seen` cards off the top hold a given number of them.
// Works in logs, so a 99-card deck's huge factorials stay in range. Pure, so
// it's easy to test.

const logFactorials = [0];
function logFactorial(n: number): number {
  for (let i = logFactorials.length; i <= n; i++) logFactorials[i] = logFactorials[i - 1] + Math.log(i);
  return logFactorials[n];
}
const logChoose = (n: number, k: number) => logFactorial(n) - logFactorial(k) - logFactorial(n - k);

/** The chance of exactly `want` hits among the cards seen. */
export function chanceExactly(deck: number, hits: number, seen: number, want: number): number {
  const drawn = Math.min(seen, deck);
  if (want < 0 || want > hits || want > drawn || drawn - want > deck - hits) return 0;
  return Math.exp(logChoose(hits, want) + logChoose(deck - hits, drawn - want) - logChoose(deck, drawn));
}

/** The chance of `want` hits or more among the cards seen. */
export function chanceAtLeast(deck: number, hits: number, seen: number, want: number): number {
  if (want <= 0) return 1;
  let total = 0;
  for (let k = want; k <= Math.min(hits, seen); k++) total += chanceExactly(deck, hits, seen, k);
  return Math.min(1, total);
}

/** The chance of each number of hits among the cards seen, from 0 up. */
export function hitSpread(deck: number, hits: number, seen: number): number[] {
  return Array.from({ length: Math.min(hits, seen, deck) + 1 }, (_, k) => chanceExactly(deck, hits, seen, k));
}
