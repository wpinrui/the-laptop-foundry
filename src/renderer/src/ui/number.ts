/** Numbers from here up are shown short, with a suffix. */
export const SHORT_FROM = 1e4;

const SUFFIXES: [number, string][] = [
  [1e12, "t"],
  [1e9, "b"],
  [1e6, "m"],
  [1e3, "k"],
];

/** True when short() would add a suffix to the number. */
export const isShort = (n: number) => Math.abs(Math.round(n)) >= SHORT_FROM;

/** The whole number with commas, and a dollar sign for money: -$6,160,000,000, 1,299. */
export function full(n: number, money = false): string {
  const a = Math.round(Math.abs(n));
  return `${n < 0 && a > 0 ? "-" : ""}${money ? "$" : ""}${a.toLocaleString("en-US")}`;
}

/** Three significant figures of v, which is at least 1: 6.16, 41.2, 412. */
function sig3(v: number): string {
  // Rounding can carry into the next decade (9.996 to 10.00), so size the decimals on the rounded value.
  const r = Number(v.toPrecision(3));
  return r.toFixed(r >= 100 ? 0 : r >= 10 ? 1 : 2);
}

/** The number at three significant figures with a suffix from 10,000 up: $6.16b, 412m, 12.4k. */
export function short(n: number, money = false): string {
  if (!isShort(n)) return full(n, money);
  const a = Math.abs(n);
  const head = `${n < 0 ? "-" : ""}${money ? "$" : ""}`;
  // The largest suffix the number reaches, stepping up when it rounds to 1000 of it (999,999 is 1.00m).
  let i = SUFFIXES.findIndex(([base]) => a >= base);
  if (i > 0 && Number(sig3(a / SUFFIXES[i][0])) >= 1000) i--;
  const [base, suffix] = SUFFIXES[i];
  return `${head}${sig3(a / base)}${suffix}`;
}
