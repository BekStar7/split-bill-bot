/**
 * Domain types. Pure data — no Telegram or DB concerns here.
 *
 * All money is an integer in the smallest currency unit (Money).
 * For KZT we work in whole tenge; the type is still integer-only so that
 * switching to minor units later is a one-line change in money.ts.
 */

export type Money = number;

export type UserId = string;

export type SplitMode = 'equal' | 'itemized';

export type BillStatus = 'draft' | 'assigning' | 'done';

export interface BillItem {
  /** 1-based index as shown to users */
  idx: number;
  title: string;
  qty: number;
  unitPrice: Money;
  /** qty * unitPrice as printed on the receipt */
  amount: Money;
  /** Shared items (hookah, bread, water) are split across ALL participants */
  shared: boolean;
  /**
   * Who marked this item as theirs (itemized mode) — one entry per unit taken.
   * On a multi-unit item (integer qty > 1) a user appears once per unit they took.
   * See core/claims.ts for the rules.
   */
  claimedBy: UserId[];
}

export interface Participant {
  userId: UserId;
  displayName: string;
  /** Got in by tapping an item rather than "join" — drops out again once they release their last item */
  autoJoined?: boolean;
}

export interface Bill {
  id: string;
  chatId: number;
  messageId?: number;
  /** The "💰 Итого к оплате" message — edited in place when someone toggles payment status */
  resultMessageId?: number;
  /** Participants who have been marked as having paid (self or confirmed by the creator) */
  paid?: UserId[];
  createdBy: UserId;
  createdAt: number;
  status: BillStatus;
  mode: SplitMode;
  currency: string;
  items: BillItem[];
  participants: Participant[];
  /** Service fee as percent of subtotal, e.g. 10 → 10% */
  serviceFeePct?: number;
  /** Service fee as an absolute amount (when receipt prints a sum, not %) */
  serviceFeeAbs?: Money;
  discountAbs?: Money;
  tipPct?: number;
  /** Total as printed on the receipt — used for reconciliation */
  total: Money;
  payerId?: UserId;
}

export interface SettlementLine {
  itemIdx: number;
  title: string;
  /** How many people this item was split between */
  splitBetween: number;
  amount: Money;
  /** Units of a multi-unit item covered by this line (omitted for single-unit items) */
  units?: number;
}

export interface Settlement {
  userId: UserId;
  displayName: string;
  /** Sum of item shares before fees */
  base: Money;
  /** Proportional share of service fee + tip - discount */
  adjustments: Money;
  /** Final amount to pay, rounded */
  amount: Money;
  lines: SettlementLine[];
}

export interface SplitResult {
  settlements: Settlement[];
  subtotal: Money;
  serviceFee: Money;
  tip: Money;
  discount: Money;
  /** Sum of all settlements — equals the receipt total when `gap` was absorbed */
  total: Money;
  /**
   * Receipt total minus what items + fees explain. When small enough it is split
   * equally between everyone (and included in `total`); otherwise left unassigned
   * so the discrepancy stays visible.
   */
  gap: Money;
  gapAbsorbed: boolean;
  /** Items with at least one unclaimed unit in itemized mode (those units are treated as shared) */
  unclaimedItemIdx: number[];
  /** Per-item detail for the above: how many units went to everyone */
  unclaimed: Array<{ itemIdx: number; title: string; units: number; ofUnits: number }>;
}
