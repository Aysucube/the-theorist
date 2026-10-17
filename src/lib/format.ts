const php = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const count = new Intl.NumberFormat("en-PH");

export const formatPhp = (n: number) => php.format(n);
export const formatUsd = (n: number) => usd.format(n);
export const formatCount = (n: number) => count.format(n);
// Below 1% a rounded whole number would read as "0%", so keep one decimal there.
export const formatPercent = (n: number) => {
  const pct = n * 100;
  return `${Math.abs(pct) < 1 && pct !== 0 ? pct.toFixed(1) : Math.round(pct)}%`;
};

export function cardHref(name: string) {
  return { pathname: "/card", query: { q: name } };
}
