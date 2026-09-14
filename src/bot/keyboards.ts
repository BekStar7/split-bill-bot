import { InlineKeyboard } from 'grammy';
import { claimCounts, unclaimedUnits, unitCount } from '../core/claims.js';
import type { Bill, BillItem, SplitResult, UserId } from '../core/types.js';
import { personEmoji } from './emoji.js';

/**
 * Callback data format (≤64 bytes): `<action>:<billId>[:<arg>]`
 *   j   join/leave
 *   m   set mode         arg: e | i
 *   t   toggle claim     arg: itemIdx
 *   c   calculate
 *   p   toggle paid       arg: userId
 *   n   no-op (Telegram has no inert buttons, so labels answer silently)
 */
export const cb = {
  join: (b: Bill) => `j:${b.id}`,
  mode: (b: Bill, m: 'e' | 'i') => `m:${b.id}:${m}`,
  toggle: (b: Bill, idx: number) => `t:${b.id}:${idx}`,
  calc: (b: Bill) => `c:${b.id}`,
  pay: (b: Bill, userId: UserId) => `p:${b.id}:${userId}`,
  noop: (b: Bill) => `n:${b.id}`,
};

export const CB_RE = /^([jmtcnp]):([A-Za-z0-9_-]{6,12})(?::(.+))?$/;

export function billKeyboard(bill: Bill): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (bill.status === 'done') return kb;

  if (bill.mode === 'itemized' && bill.status === 'assigning') {
    for (const it of bill.items) {
      // Left is just a label. Right claims the item for whoever taps it (auto-joins them);
      // tap again to release. Shows who took it — 🌐 means nobody, so it's split between everyone.
      const qty = unitCount(it) > 1 ? ` ×${it.qty}` : '';
      const label = `${it.idx}. ${truncate(it.title, 18 - qty.length)}${qty}`;
      kb.text(label, cb.noop(bill)).text(claimButton(it), cb.toggle(bill, it.idx)).row();
    }
  }

  kb.text('🙋 Я участвую / выйти', cb.join(bill)).row();
  kb.text(bill.mode === 'equal' && bill.status !== 'draft' ? '✅ Поровну' : 'Поровну', cb.mode(bill, 'e'))
    .text(bill.mode === 'itemized' ? '✅ Каждый своё' : 'Каждый своё', cb.mode(bill, 'i'))
    .row();
  kb.text('🧮 Посчитать', cb.calc(bill));
  return kb;
}

/** `/start` payload that asks for a personal breakdown of a bill: `d_<billId>`. */
export const DETAILS_PREFIX = 'd_';

/**
 * Under the "who owes what" message: one row per person to mark them paid/unpaid, plus a
 * t.me deep link that opens a private chat with the bot and sends `/start d_<billId>` —
 * works even for people who never talked to the bot, which a plain callback couldn't
 * (bots can't DM first). Unpaid people are listed first so there's something to act on.
 */
export function resultKeyboard(bill: Bill, result: SplitResult, botUsername: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  const paid = new Set(bill.paid ?? []);
  const byPaidLast = [...result.settlements].sort((a, b) => Number(paid.has(a.userId)) - Number(paid.has(b.userId)));

  for (const s of byPaidLast) {
    const isPaid = paid.has(s.userId);
    const label = isPaid
      ? `↩️ Отменить оплату: ${truncate(s.displayName, 24)}`
      : `✅ Оплатил(а): ${truncate(s.displayName, 24)}`;
    kb.text(label, cb.pay(bill, s.userId)).row();
  }

  kb.url('🔎 Подробнее (в личке)', `https://t.me/${botUsername}?start=${DETAILS_PREFIX}${bill.id}`);
  return kb;
}

/**
 * Right-column button: one emoji per unit taken, 🌐 per unit nobody took.
 *   "Cola ×3", me ×2 + Ali ×1 → 🧑🧑🤠;  me ×1 only → 🧑🌐🌐;  nothing → 🌐
 * Big quantities collapse to counts (🧑×7 🌐×3) so the button stays readable.
 */
const MAX_UNIT_EMOJIS = 6;

function claimButton(it: BillItem): string {
  const units = unitCount(it);
  const free = unclaimedUnits(it);
  if (units === 1) return it.claimedBy.length ? it.claimedBy.map(personEmoji).join('') : '🌐';

  if (units <= MAX_UNIT_EMOJIS) {
    return it.claimedBy.map(personEmoji).join('') + '🌐'.repeat(free);
  }
  const parts = [...claimCounts(it)].map(([u, n]) => `${personEmoji(u)}×${n}`);
  if (free > 0) parts.push(`🌐×${free}`);
  return parts.join(' ');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
