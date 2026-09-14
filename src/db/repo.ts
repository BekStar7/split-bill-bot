import { eq } from 'drizzle-orm';
import type { Bill, SplitResult } from '../core/types.js';
import type { Db } from './client.js';
import { bills, settlements } from './schema.js';

export class BillRepo {
  constructor(private readonly db: Db) {}

  save(bill: Bill): void {
    this.db
      .insert(bills)
      .values({
        id: bill.id,
        chatId: bill.chatId,
        messageId: bill.messageId ?? null,
        createdBy: bill.createdBy,
        createdAt: bill.createdAt,
        status: bill.status,
        data: bill,
      })
      .onConflictDoUpdate({
        target: bills.id,
        set: { messageId: bill.messageId ?? null, status: bill.status, data: bill },
      })
      .run();
  }

  get(id: string): Bill | undefined {
    const row = this.db.select().from(bills).where(eq(bills.id, id)).get();
    return row ? (row.data as Bill) : undefined;
  }

  saveSettlements(bill: Bill, result: SplitResult): void {
    const now = Date.now();
    this.db
      .insert(settlements)
      .values(
        result.settlements.map((s) => ({
          billId: bill.id,
          chatId: bill.chatId,
          userId: s.userId,
          payerId: bill.payerId ?? null,
          amount: s.amount,
          createdAt: now,
        })),
      )
      .run();
  }
}
