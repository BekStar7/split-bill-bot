import { claimCounts, unclaimedUnits, unitCount } from '../core/claims.js';
import { formatMoney } from '../core/money.js';
import { reconcile } from '../core/split.js';
import type { Bill, SplitResult } from '../core/types.js';
import { personEmoji } from './emoji.js';

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

/** Pings the user in the message, even without a @username — works as long as they've sent a message in this chat. */
const mention = (userId: string, name: string) => `<a href="tg://user?id=${userId}">${esc(name)}</a>`;

export function renderBill(bill: Bill): string {
  const cur = bill.currency;
  const names = new Map(bill.participants.map((p) => [p.userId, p.displayName]));

  const lines = bill.items.map((it) => {
    const qty = it.qty !== 1 ? ` ×${it.qty}` : '';
    let who = '';
    if (bill.mode === 'itemized' && bill.status === 'assigning') {
      const multi = unitCount(it) > 1;
      const takers = [...claimCounts(it)].map(
        ([u, n]) => `${personEmoji(u)} ${esc(names.get(u) ?? u)}${multi && n > 1 ? ` ×${n}` : ''}`,
      );
      const free = unclaimedUnits(it);
      if (free > 0) takers.push(multi && takers.length ? `🌐 ${free} на всех` : '🌐 на всех');
      who = ' — ' + takers.join(', ');
    }
    return `${it.idx}. ${esc(it.title)}${qty} — <b>${formatMoney(it.amount)}</b>${who}`;
  });

  const fee =
    bill.serviceFeeAbs != null
      ? `Сервис: ${formatMoney(bill.serviceFeeAbs, cur)}`
      : bill.serviceFeePct
        ? `Сервис: ${bill.serviceFeePct}%`
        : null;
  const disc = bill.discountAbs ? `Скидка: −${formatMoney(bill.discountAbs, cur)}` : null;

  const mode = bill.status === 'draft' ? 'не выбран' : bill.mode === 'equal' ? 'поровну' : 'каждый своё';

  return [
    `🧾 <b>Счёт</b> · ${bill.items.length} позиций · итого <b>${formatMoney(bill.total, cur)}</b>`,
    '',
    ...lines,
    '',
    [fee, disc].filter(Boolean).join(' · '),
    `Режим: <b>${mode}</b>`,
    `Участники (${bill.participants.length}): ${bill.participants.map((p) => `${personEmoji(p.userId)} ${esc(p.displayName)}`).join(', ')}`,
    bill.mode === 'itemized' && bill.status === 'assigning'
      ? '\n👇 Жми справа от позиции, чтобы забрать её себе (можно нескольким — разделится между вами)\n🔁 Если позиций несколько (×2, ×3), каждый клик берёт ещё одну штуку; клик сверх свободного снимает тебя\n🌐 — никто не забрал, разделится на всех поровну'
      : '',
  ]
    .filter((l) => l !== null)
    .join('\n')
    .trim();
}

/** Collapsed view shown in place of the full itemized bill once it's calculated. */
export function renderClosed(bill: Bill): string {
  return [
    `🧾 <b>Счёт</b> · ${bill.items.length} позиций · итого <b>${formatMoney(bill.total, bill.currency)}</b>`,
    '',
    '✅ Посчитан — итоги в сообщении ниже 👇',
  ].join('\n');
}

export function renderResult(bill: Bill, result: SplitResult): string {
  const cur = bill.currency;
  const rows = result.settlements
    .sort((a, b) => b.amount - a.amount)
    .map((s) => {
      const items = s.lines
        .map((l) => {
          const units = l.units && l.units > 1 ? ` ×${l.units}` : '';
          const div = l.splitBetween > 1 ? ` ÷${l.splitBetween}` : '';
          return `${esc(l.title)}${units}${div}`;
        })
        .join(', ');
      const adj = s.adjustments ? ` + сервис ${formatMoney(s.adjustments)}` : '';
      return `${mention(s.userId, s.displayName)} — <b>${formatMoney(s.amount, cur)}</b>\n<i>${items}${adj}</i>`;
    });

  const diff = reconcile(bill, result);
  const check =
    diff === 0
      ? `✔ Сходится с чеком: ${formatMoney(bill.total, cur)}`
      : `⚠️ Расхождение с чеком: ${formatMoney(diff, cur)} (в чеке ${formatMoney(bill.total, cur)}, посчитано ${formatMoney(result.total, cur)})`;

  const unclaimed = result.unclaimed.length
    ? `\nℹ️ Никто не отметил — разделено на всех: ${result.unclaimed
        .map((u) => `${esc(u.title)}${u.ofUnits > 1 ? ` (${u.units} из ${u.ofUnits})` : ''}`)
        .join(', ')}.`
    : '';

  return [`💰 <b>Итого к оплате</b>`, '', ...rows, '', check + unclaimed].join('\n');
}
