import { describe, expect, it } from 'vitest';
import { reconcile, splitBill } from '../src/core/split.js';
import type { Bill, BillItem } from '../src/core/types.js';

const item = (idx: number, title: string, amount: number, extra: Partial<BillItem> = {}): BillItem => ({
  idx,
  title,
  qty: 1,
  unitPrice: amount,
  amount,
  shared: false,
  claimedBy: [],
  ...extra,
});

const baseBill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  chatId: -1,
  createdBy: 'beke',
  createdAt: 0,
  status: 'assigning',
  mode: 'itemized',
  currency: '₸',
  participants: [
    { userId: 'beke', displayName: 'Беке' },
    { userId: 'aidar', displayName: 'Айдар' },
    { userId: 'daniyar', displayName: 'Данияр' },
  ],
  items: [],
  total: 0,
  ...over,
});

const byUser = (r: ReturnType<typeof splitBill>) =>
  Object.fromEntries(r.settlements.map((s) => [s.userId, s.amount]));

describe('equal mode', () => {
  it('splits subtotal + service evenly', () => {
    const bill = baseBill({
      mode: 'equal',
      items: [item(1, 'Стейк', 25000), item(2, 'Цезарь', 4500), item(3, 'Кальян', 8000)],
      serviceFeePct: 10,
      total: 41250,
    });
    const r = splitBill(bill);
    expect(r.subtotal).toBe(37500);
    expect(r.serviceFee).toBe(3750);
    expect(r.total).toBe(41250);
    expect(reconcile(bill, r)).toBe(0);
    expect(byUser(r)).toEqual({ beke: 13750, aidar: 13750, daniyar: 13750 });
  });
});

describe('itemized mode', () => {
  it('assigns claimed items to claimers and shared items to everyone', () => {
    const bill = baseBill({
      items: [
        item(1, 'Стейк', 25000, { claimedBy: ['beke'] }),
        item(2, 'Цезарь', 4500, { claimedBy: ['aidar'] }),
        item(3, 'Кальян', 9000, { shared: true }),
        item(4, 'Кола', 1800, { claimedBy: ['aidar', 'daniyar'] }),
      ],
      total: 40300,
    });
    const r = splitBill(bill);
    expect(byUser(r)).toEqual({
      beke: 25000 + 3000,
      aidar: 4500 + 3000 + 900,
      daniyar: 3000 + 900,
    });
    expect(r.total).toBe(40300);
    expect(r.unclaimedItemIdx).toEqual([]);
  });

  it('distributes service fee proportionally, not equally', () => {
    const bill = baseBill({
      participants: [
        { userId: 'a', displayName: 'A' },
        { userId: 'b', displayName: 'B' },
      ],
      items: [item(1, 'Стейк', 30000, { claimedBy: ['a'] }), item(2, 'Кофе', 1000, { claimedBy: ['b'] })],
      serviceFeePct: 10,
      total: 34100,
    });
    const r = splitBill(bill);
    const a = r.settlements.find((s) => s.userId === 'a')!;
    const b = r.settlements.find((s) => s.userId === 'b')!;
    expect(a.adjustments).toBe(3000);
    expect(b.adjustments).toBe(100);
    expect(r.total).toBe(34100);
  });

  it('treats unclaimed items as shared and reports them', () => {
    const bill = baseBill({
      items: [item(1, 'Стейк', 25000, { claimedBy: ['beke'] }), item(2, 'Хлеб', 900)],
      total: 25900,
    });
    const r = splitBill(bill);
    expect(r.unclaimedItemIdx).toEqual([2]);
    expect(byUser(r)).toEqual({ beke: 25300, aidar: 300, daniyar: 300 });
  });

  it('ignores claims from non-participants', () => {
    const bill = baseBill({
      items: [item(1, 'Стейк', 3000, { claimedBy: ['stranger'] })],
      total: 3000,
    });
    const r = splitBill(bill);
    expect(r.unclaimedItemIdx).toEqual([1]);
    expect(r.total).toBe(3000);
  });

  it('applies absolute service fee, tip and discount with exact sum', () => {
    const bill = baseBill({
      items: [item(1, 'A', 10001, { claimedBy: ['beke', 'aidar', 'daniyar'] })],
      serviceFeeAbs: 1000,
      tipPct: 5,
      discountAbs: 500,
      total: 10001 + 1000 + 500 - 500,
    });
    const r = splitBill(bill);
    expect(r.tip).toBe(500);
    expect(r.total).toBe(11001);
    expect(reconcile(bill, r)).toBe(0);
  });

  it('throws with no participants', () => {
    expect(() => splitBill(baseBill({ participants: [] }))).toThrow();
  });
});
