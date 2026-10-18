const phpWhole = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});
const phpCents = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const count = new Intl.NumberFormat("en-PH");

// Whole pesos as "₱90"; anything with centavos as "₱589.70", never "₱589.7".
export const formatPhp = (n: number) =>
  Number.isInteger(Math.round(n * 100) / 100) ? phpWhole.format(n) : phpCents.format(n);
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

const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" });
/** "2024-11-08" as "Nov 8, 2024". The date is read as UTC so it can't shift a day. */
export const formatDate = (isoDate: string) => date.format(new Date(`${isoDate}T00:00:00Z`));
