import { describe, expect, it } from 'vitest';
import { normalizeParsed } from '../src/ocr/normalize.js';
import type { ParsedBill } from '../src/ocr/schema.js';

const parsed = (over: Partial<ParsedBill>): ParsedBill => ({
  items: [
    { title: 'A', qty: 1, unitPrice: 30000, amount: 30000 },
    { title: 'B', qty: 2, unitPrice: 4095, amount: 8190 },
  ], // 38190
  serviceFeePct: null,
  serviceFeeAbs: null,
  discountAbs: null,
  total: 38190,
  currency: 'KZT',
  notes: null,
  ...over,
});

describe('normalizeParsed', () => {
  it('drops a discount that merely mirrors the service fee', () => {
    // Real case: "Надбавка обслуживание 10%" 5819 was filed as both fee and discount.
    const p = parsed({ serviceFeePct: 10, serviceFeeAbs: 5819, discountAbs: 5819, total: 38190 + 5819 });
    const n = normalizeParsed(p);
    expect(n.discountAbs).toBeNull();
    expect(n.serviceFeeAbs).toBe(5819);
  });

  it('keeps fee and discount when they explain the total', () => {
    const p = parsed({ serviceFeeAbs: 3819, discountAbs: 2000, total: 38190 + 3819 - 2000 });
    expect(normalizeParsed(p)).toEqual(p);
  });

  it('prefers the percent when the absolute fee is misread', () => {
    const p = parsed({ serviceFeePct: 10, serviceFeeAbs: 58190, total: 38190 + 3819 });
    const n = normalizeParsed(p);
    expect(n.serviceFeeAbs).toBeNull();
    expect(n.serviceFeePct).toBe(10);
  });

  it('drops a phantom fee when items alone match the total', () => {
    const p = parsed({ serviceFeeAbs: 5000, total: 38190 });
    expect(normalizeParsed(p).serviceFeeAbs).toBeNull();
  });

  it('leaves an unexplained total alone (nothing to choose from)', () => {
    const p = parsed({ total: 40000 });
    expect(normalizeParsed(p)).toEqual(p);
  });
});
