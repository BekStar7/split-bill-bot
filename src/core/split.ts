import { allocate, percentOf, sum } from './money.js';
import type { Bill, Money, Settlement, SettlementLine, SplitResult, UserId } from './types.js';

/**
 * Pure bill-splitting algorithm. No I/O.
 *
 * 1. Each participant gets a base share from items.
 *    - equal:    subtotal / n
 *    - itemized: shared items → everyone; claimed items → claimers;
 *                unclaimed items → everyone (and reported).
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
  const unclaimedItemIdx: number[] = [];

  const addShare = (userId: UserId, line: SettlementLine) => {
    base.set(userId, (base.get(userId) ?? 0) + line.amount);
    lines.get(userId)?.push(line);
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
    let recipients: UserId[];

    if (item.shared) {
      recipients = ids;
    } else {
      const claimers = item.claimedBy.filter((u) => base.has(u));
      if (claimers.length === 0) {
        unclaimedItemIdx.push(item.idx);
        recipients = ids;
      } else {
        recipients = claimers;
      }
    }

    const shares = allocate(item.amount, recipients.map(() => 1));
    recipients.forEach((userId, i) => {
      addShare(userId, {
        itemIdx: item.idx,
        title: item.title,
        splitBetween: recipients.length,
        amount: shares[i] ?? 0,
      });
    });
  }

  const serviceFee =
    bill.serviceFeeAbs ?? (bill.serviceFeePct ? percentOf(subtotal, bill.serviceFeePct) : 0);
  const tip = bill.tipPct ? percentOf(subtotal, bill.tipPct) : 0;
  const discount = bill.discountAbs ?? 0;
  const adjustmentTotal = serviceFee + tip - discount;

  const baseShares = ids.map((id) => base.get(id) ?? 0);
  const adjustments = allocate(adjustmentTotal, baseShares);

  const settlements: Settlement[] = participants.map((p, i) => {
    const b = baseShares[i] ?? 0;
    const adj = adjustments[i] ?? 0;
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
    unclaimedItemIdx,
  };
}

/** Difference between what the receipt says and what we computed. 0 = perfect. */
export function reconcile(bill: Bill, result: SplitResult): Money {
  return bill.total - result.total;
}
