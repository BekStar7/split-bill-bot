import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * MVP storage: the whole Bill aggregate is stored as JSON in one row.
 * Bills are small, short-lived and always loaded whole, so a document
 * shape is simpler than 4 normalized tables. Settlements are copied to
 * their own table for future debt tracking / history queries.
 */
export const bills = sqliteTable('bills', {
  id: text('id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status', { enum: ['draft', 'assigning', 'done'] }).notNull(),
  /** Full Bill aggregate, JSON */
  data: text('data', { mode: 'json' }).notNull(),
});

/**
 * Caches OCR results by receipt image hash (sha256 of the raw bytes) so that
 * re-uploading (or replying to) the same photo doesn't burn another Anthropic call.
 */
export const receiptCache = sqliteTable('receipt_cache', {
  hash: text('hash').primaryKey(),
  /** Parsed ParsedBill, JSON */
  parsed: text('parsed', { mode: 'json' }).notNull(),
  createdAt: integer('created_at').notNull(),
});

export const settlements = sqliteTable('settlements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  billId: text('bill_id')
    .notNull()
    .references(() => bills.id),
  chatId: integer('chat_id').notNull(),
  userId: text('user_id').notNull(),
  payerId: text('payer_id'),
  amount: integer('amount').notNull(),
  createdAt: integer('created_at').notNull(),
});
