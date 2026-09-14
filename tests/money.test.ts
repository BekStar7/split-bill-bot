import { describe, expect, it } from 'vitest';
import { allocate, formatMoney, percentOf, splitEqually } from '../src/core/money.js';

describe('allocate', () => {
  it('sums exactly to total', () => {
    const r = allocate(100, [1, 1, 1]);
    expect(r).toEqual([34, 33, 33]);
    expect(r.reduce((a, b) => a + b)).toBe(100);
  });

  it('respects weights', () => {
    expect(allocate(1000, [3, 1])).toEqual([750, 250]);
  });

  it('handles zero weights as equal split', () => {
    expect(allocate(10, [0, 0])).toEqual([5, 5]);
  });

  it('handles negative totals (discounts)', () => {
    const r = allocate(-100, [1, 1, 1]);
    expect(r.reduce((a, b) => a + b)).toBe(-100);
  });

  it('never differs by more than 1 between equal weights', () => {
    for (let total = 0; total < 200; total++) {
      for (let n = 1; n < 9; n++) {
        const r = splitEqually(total, n);
        expect(r.reduce((a, b) => a + b)).toBe(total);
        expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('percentOf', () => {
  it('rounds to nearest unit', () => {
    expect(percentOf(42300, 10)).toBe(4230);
    expect(percentOf(999, 10)).toBe(100);
  });
});

describe('formatMoney', () => {
  it('groups thousands', () => {
    expect(formatMoney(42300, '₸')).toBe('42 300 ₸');
    expect(formatMoney(500)).toBe('500');
    expect(formatMoney(-1500)).toBe('−1 500');
  });
});
