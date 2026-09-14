import type { BillItem, UserId } from './types.js';

/**
 * Claim semantics for a bill item. Pure functions, no I/O.
 *
 * `claimedBy` holds one entry per unit taken, so a user may appear several times
 * on a multi-unit item ("Cola ×3" → ['bek', 'bek', 'ali']).
 *
 * Items with a single unit (qty 1, or a fractional qty like 0.35 kg) keep the
 * simple rule: any number of people can claim it and it's split between them.
 */

/** How many separately claimable units the item has. */
export function unitCount(item: BillItem): number {
  return Number.isInteger(item.qty) && item.qty > 1 ? item.qty : 1;
}

/** Units each user has taken, in first-claim order. */
export function claimCounts(item: BillItem): Map<UserId, number> {
  const counts = new Map<UserId, number>();
  for (const u of item.claimedBy) counts.set(u, (counts.get(u) ?? 0) + 1);
  return counts;
}

export function claimsOf(item: BillItem, userId: UserId): number {
  return item.claimedBy.filter((u) => u === userId).length;
}

/** Units nobody has taken — these get split between all participants. */
export function unclaimedUnits(item: BillItem): number {
  return Math.max(0, unitCount(item) - item.claimedBy.length);
}

/**
 * One tap on the item by `userId`. Mutates `item.claimedBy`.
 *
 * Single unit: toggle presence.
 * Multiple units: each tap takes one more unit while any are free (others' units
 * are never touched); the tap after reaching the cap releases all of this user's units.
 */
export function tapClaim(item: BillItem, userId: UserId): 'added' | 'released' {
  const units = unitCount(item);
  const mine = claimsOf(item, userId);

  if (units === 1) {
    if (mine > 0) {
      item.claimedBy = item.claimedBy.filter((u) => u !== userId);
      return 'released';
    }
    item.claimedBy = [...item.claimedBy, userId];
    return 'added';
  }

  const others = item.claimedBy.length - mine;
  const free = units - others;
  if (mine < free) {
    item.claimedBy = [...item.claimedBy, userId];
    return 'added';
  }
  item.claimedBy = item.claimedBy.filter((u) => u !== userId);
  return 'released';
}
