import { nanoid } from 'nanoid';
import { splitBill } from '../core/split.js';
import type { Bill, Participant, SplitMode, SplitResult, UserId } from '../core/types.js';
import type { BillRepo } from '../db/repo.js';
import type { ParsedBill } from '../ocr/schema.js';

/**
 * Orchestrates the bill lifecycle. Every mutation loads → changes → saves,
 * and returns the fresh Bill so handlers can re-render the message.
 */
export class BillService {
  constructor(private readonly repo: BillRepo) {}

  createFromParsed(parsed: ParsedBill, ctx: { chatId: number; creator: Participant; currency: string }): Bill {
    const bill: Bill = {
      id: nanoid(8),
      chatId: ctx.chatId,
      createdBy: ctx.creator.userId,
      createdAt: Date.now(),
      status: 'draft',
      mode: 'equal',
      currency: ctx.currency,
      items: parsed.items.map((it, i) => ({
        idx: i + 1,
        title: it.title,
        qty: it.qty,
        unitPrice: it.unitPrice,
        amount: it.amount,
        shared: false,
        claimedBy: [],
      })),
      participants: [ctx.creator],
      total: parsed.total,
    };
    if (parsed.serviceFeePct != null) bill.serviceFeePct = parsed.serviceFeePct;
    if (parsed.serviceFeeAbs != null) bill.serviceFeeAbs = parsed.serviceFeeAbs;
    if (parsed.discountAbs != null) bill.discountAbs = parsed.discountAbs;
    this.repo.save(bill);
    return bill;
  }

  get(id: string): Bill {
    const bill = this.repo.get(id);
    if (!bill) throw new BillNotFound(id);
    return bill;
  }

  attachMessage(id: string, messageId: number): Bill {
    return this.update(id, (b) => {
      b.messageId = messageId;
    });
  }

  toggleParticipant(id: string, p: Participant): Bill {
    return this.update(id, (b) => {
      const i = b.participants.findIndex((x) => x.userId === p.userId);
      if (i >= 0) {
        if (b.participants.length === 1) return; // never remove the last one
        b.participants.splice(i, 1);
        for (const item of b.items) item.claimedBy = item.claimedBy.filter((u) => u !== p.userId);
      } else {
        b.participants.push(p);
      }
    });
  }

  setMode(id: string, mode: SplitMode): Bill {
    return this.update(id, (b) => {
      b.mode = mode;
      b.status = 'assigning';
    });
  }

  toggleClaim(id: string, itemIdx: number, userId: UserId): Bill {
    return this.update(id, (b) => {
      const item = b.items.find((i) => i.idx === itemIdx);
      if (!item || item.shared) return;
      if (!b.participants.some((p) => p.userId === userId)) return;
      item.claimedBy = item.claimedBy.includes(userId)
        ? item.claimedBy.filter((u) => u !== userId)
        : [...item.claimedBy, userId];
    });
  }

  toggleShared(id: string, itemIdx: number): Bill {
    return this.update(id, (b) => {
      const item = b.items.find((i) => i.idx === itemIdx);
      if (!item) return;
      item.shared = !item.shared;
      if (item.shared) item.claimedBy = [];
    });
  }

  calculate(id: string): { bill: Bill; result: SplitResult } {
    const bill = this.update(id, (b) => {
      b.status = 'done';
    });
    const result = splitBill(bill);
    this.repo.saveSettlements(bill, result);
    return { bill, result };
  }

  canManage(bill: Bill, userId: UserId): boolean {
    return bill.createdBy === userId;
  }

  private update(id: string, fn: (b: Bill) => void): Bill {
    const bill = this.get(id);
    fn(bill);
    this.repo.save(bill);
    return bill;
  }
}

export class BillNotFound extends Error {
  constructor(id: string) {
    super(`Bill ${id} not found`);
  }
}
