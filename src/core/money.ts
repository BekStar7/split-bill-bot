import type { Money } from './types.js';

/**
 * Distribute `total` across `weights` proportionally, returning integers
 * that sum EXACTLY to `total` (largest-remainder method).
 *
 * Example: 100 split by [1,1,1] → [34,33,33]
 */
export function allocate(total: Money, weights: number[]): Money[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    // No information → equal split
    return allocate(total, weights.map(() => 1));
  }

  const exact = weights.map((w) => (total * w) / weightSum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  // Hand out remaining units to the largest fractional parts first.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i] = (result[i] ?? 0) + 1;
    remainder--;
  }
  return result;
}

/** Equal split with exact sum. */
export function splitEqually(total: Money, n: number): Money[] {
  if (n <= 0) return [];
  return allocate(total, Array.from({ length: n }, () => 1));
}

export function percentOf(amount: Money, pct: number): Money {
  return Math.round((amount * pct) / 100);
}

export function sum(values: Money[]): Money {
  return values.reduce((a, b) => a + b, 0);
}

/** 42300 → "42 300" */
export function formatMoney(amount: Money, currency = ''): string {
  const s = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = amount < 0 ? '−' : '';
  return currency ? `${sign}${s} ${currency}` : `${sign}${s}`;
}
