import { claimCounts, unitCount } from './claims.js';
import { allocate, percentOf, sum } from './money.js';
import type { Bill, Money, Settlement, SettlementLine, SplitResult, UserId } from './types.js';

/**
 * Pure bill-splitting algorithm. No I/O.
 *
 * 1. Each participant gets a base share from items.
 *    - equal:    subtotal / n
 *    - itemized: shared items → everyone; claimed items → claimers;
 *                multi-unit items → each claimer pays for the units they took;
 *                unclaimed items/units → everyone (and reported).
 * 2. Service fee, tip and discount are distributed proportionally to base share.
 * 3. Every distribution uses largest-remainder rounding so the sum is exact.
 */
export function splitBill(bill: Bill): SplitResult {
  const participants = bill.participants;
  if (participants.length === 0) {
    throw new Error('Cannot split a bill with no participants');
  }

  const subtotal = sum(bill.items.map((i) => i.amount));
  const ids = participants.map((p) => p.userId);

  const base = new Map<UserId, Money>(ids.map((id) => [id, 0]));
  const lines = new Map<UserId, SettlementLine[]>(ids.map((id) => [id, []]));
  const unclaimed: SplitResult['unclaimed'] = [];

  const addShare = (userId: UserId, line: SettlementLine) => {
    base.set(userId, (base.get(userId) ?? 0) + line.amount);
    lines.get(userId)?.push(line);
  };

  /** Split `amount` of `item` evenly between everyone. */
  const shareWithAll = (item: Bill['items'][number], amount: Money, units?: number) => {
    const shares = allocate(amount, ids.map(() => 1));
    ids.forEach((userId, i) => {
      addShare(userId, {
        itemIdx: item.idx,
        title: item.title,
        splitBetween: ids.length,
        amount: shares[i] ?? 0,
        ...(units !== undefined ? { units } : {}),
      });
    });
  };

  if (bill.mode === 'equal') {
    // Split the subtotal as a whole — per-item rounding would accumulate a skew.
    const shares = allocate(subtotal, ids.map(() => 1));
    ids.forEach((userId, i) => {
      addShare(userId, {
        itemIdx: 0,
        title: 'Общий счёт',
        splitBetween: ids.length,
        amount: shares[i] ?? 0,
      });
    });
  }

  for (const item of bill.mode === 'equal' ? [] : bill.items) {
    if (item.shared) {
      shareWithAll(item, item.amount);
      continue;
    }

    const units = unitCount(item);
    const counts = new Map([...claimCounts(item)].filter(([u]) => base.has(u)));
    const claimedUnits = sum([...counts.values()]);

    if (claimedUnits === 0) {
      unclaimed.push({ itemIdx: item.idx, title: item.title, units, ofUnits: units });
      shareWithAll(item, item.amount, units > 1 ? units : undefined);
      continue;
    }

    if (units === 1) {
      // Single unit, possibly several people on it (a salad for two) — split evenly between them.
      const claimers = [...counts.keys()];
      const shares = allocate(item.amount, claimers.map(() => 1));
      claimers.forEach((userId, i) => {
        addShare(userId, { itemIdx: item.idx, title: item.title, splitBetween: claimers.length, amount: shares[i] ?? 0 });
      });
      continue;
    }

    // Multi-unit: everyone pays for the units they took; leftover units go to everyone.
    const free = units - claimedUnits;
    const claimers = [...counts.keys()];
    const weights = [...counts.values(), ...(free > 0 ? [free] : [])];
    const parts = allocate(item.amount, weights);
    claimers.forEach((userId, i) => {
      addShare(userId, {
        itemIdx: item.idx,
        title: item.title,
        splitBetween: 1,
        amount: parts[i] ?? 0,
        units: counts.get(userId) ?? 0,
      });
    });
    if (free > 0) {
      unclaimed.push({ itemIdx: item.idx, title: item.title, units: free, ofUnits: units });
      shareWithAll(item, parts[claimers.length] ?? 0, free);
    }
  }

  const serviceFee =
    bill.serviceFeeAbs ?? (bill.serviceFeePct ? percentOf(subtotal, bill.serviceFeePct) : 0);
  const tip = bill.tipPct ? percentOf(subtotal, bill.tipPct) : 0;
  const discount = bill.discountAbs ?? 0;
  const adjustmentTotal = serviceFee + tip - discount;

  const baseShares = ids.map((id) => base.get(id) ?? 0);
  const adjustments = allocate(adjustmentTotal, baseShares);

  // Whatever the receipt charges beyond items + fees (a misread fee line, a rounding
  // quirk, an unlisted surcharge) is still money the table owes. Absorb it equally —
  // unless it's so large the OCR probably misread the total itself.
  const explained = sum(baseShares) + adjustmentTotal;
  const gap = bill.total - explained;
  const gapAbsorbed = gap !== 0 && Math.abs(gap) <= explained * MAX_ABSORBED_GAP_RATIO;
  const gapShares = gapAbsorbed ? allocate(gap, ids.map(() => 1)) : ids.map(() => 0);

  const settlements: Settlement[] = participants.map((p, i) => {
    const b = baseShares[i] ?? 0;
    const adj = (adjustments[i] ?? 0) + (gapShares[i] ?? 0);
    return {
      userId: p.userId,
      displayName: p.displayName,
      base: b,
      adjustments: adj,
      amount: b + adj,
      lines: lines.get(p.userId) ?? [],
    };
  });

  return {
    settlements,
    subtotal,
    serviceFee,
    tip,
    discount,
    total: sum(settlements.map((s) => s.amount)),
    gap,
    gapAbsorbed,
    unclaimedItemIdx: unclaimed.map((u) => u.itemIdx),
    unclaimed,
  };
}

/** Gaps above this share of the explained total are left visible instead of split. */
const MAX_ABSORBED_GAP_RATIO = 0.25;

/** Difference between what the receipt says and what we computed. 0 = perfect. */
export function reconcile(bill: Bill, result: SplitResult): Money {
  return bill.total - result.total;
}
