import { InlineKeyboard } from 'grammy';
import type { Bill } from '../core/types.js';

/**
 * Callback data format (≤64 bytes): `<action>:<billId>[:<arg>]`
 *   j   join/leave
 *   m   set mode         arg: e | i
 *   t   toggle claim     arg: itemIdx
 *   s   toggle shared    arg: itemIdx
 *   c   calculate
 */
export const cb = {
  join: (b: Bill) => `j:${b.id}`,
  mode: (b: Bill, m: 'e' | 'i') => `m:${b.id}:${m}`,
  toggle: (b: Bill, idx: number) => `t:${b.id}:${idx}`,
  shared: (b: Bill, idx: number) => `s:${b.id}:${idx}`,
  calc: (b: Bill) => `c:${b.id}`,
};

export const CB_RE = /^([jmtsc]):([A-Za-z0-9_-]{6,12})(?::(.+))?$/;

export function billKeyboard(bill: Bill): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (bill.status === 'done') return kb;

  if (bill.mode === 'itemized' && bill.status === 'assigning') {
    for (const it of bill.items) {
      const label = `${it.idx}. ${truncate(it.title, 18)}${it.shared ? ' 🌐' : it.claimedBy.length ? ` (${it.claimedBy.length})` : ''}`;
      kb.text(label, cb.toggle(bill, it.idx)).text(it.shared ? '👤' : '🌐', cb.shared(bill, it.idx)).row();
    }
  }

  kb.text('🙋 Я участвую / выйти', cb.join(bill)).row();
  kb.text(bill.mode === 'equal' && bill.status !== 'draft' ? '✅ Поровну' : 'Поровну', cb.mode(bill, 'e'))
    .text(bill.mode === 'itemized' ? '✅ Каждый своё' : 'Каждый своё', cb.mode(bill, 'i'))
    .row();
  kb.text('🧮 Посчитать', cb.calc(bill));
  return kb;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
