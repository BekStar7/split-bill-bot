import { describe, expect, it } from 'vitest';
import { claimCounts, tapClaim, unclaimedUnits, unitCount } from '../src/core/claims.js';
import type { BillItem } from '../src/core/types.js';

const item = (qty: number, claimedBy: string[] = []): BillItem => ({
  idx: 1,
  title: 'Cola Zero',
  qty,
  unitPrice: 500,
  amount: 500 * qty,
  shared: false,
  claimedBy,
});

describe('unitCount', () => {
  it('treats qty 1 and fractional qty as a single unit', () => {
    expect(unitCount(item(1))).toBe(1);
    expect(unitCount(item(0.35))).toBe(1);
    expect(unitCount(item(1.5))).toBe(1);
  });
  it('uses integer qty > 1 as units', () => {
    expect(unitCount(item(3))).toBe(3);
  });
});

describe('tapClaim on a single-unit item', () => {
  it('toggles and allows several people on one item', () => {
    const it1 = item(1);
    expect(tapClaim(it1, 'bek')).toBe('added');
    expect(tapClaim(it1, 'ali')).toBe('added');
    expect(it1.claimedBy).toEqual(['bek', 'ali']);
    expect(tapClaim(it1, 'bek')).toBe('released');
    expect(it1.claimedBy).toEqual(['ali']);
  });
});

describe('tapClaim on a multi-unit item', () => {
  it('takes one more unit per tap, then releases all of mine', () => {
    const cola = item(3);
    tapClaim(cola, 'bek');
    tapClaim(cola, 'bek');
    expect(tapClaim(cola, 'bek')).toBe('added');
    expect(cola.claimedBy).toEqual(['bek', 'bek', 'bek']);
    expect(unclaimedUnits(cola)).toBe(0);

    expect(tapClaim(cola, 'bek')).toBe('released');
    expect(cola.claimedBy).toEqual([]);
    expect(unclaimedUnits(cola)).toBe(3);
  });

  it('caps me at the free units and keeps others when I reset', () => {
    const cola = item(3, ['ali']);
    expect(tapClaim(cola, 'bek')).toBe('added');
    expect(tapClaim(cola, 'bek')).toBe('added');
    expect(claimCounts(cola).get('bek')).toBe(2);
    expect(unclaimedUnits(cola)).toBe(0);

    expect(tapClaim(cola, 'bek')).toBe('released');
    expect(cola.claimedBy).toEqual(['ali']);
    expect(unclaimedUnits(cola)).toBe(2);
  });

  it('lets the other person fill what I left', () => {
    const cola = item(3, ['bek', 'bek']);
    expect(tapClaim(cola, 'ali')).toBe('added');
    expect(tapClaim(cola, 'ali')).toBe('released'); // no free unit left → reset ali
    expect(cola.claimedBy).toEqual(['bek', 'bek']);
  });
});
