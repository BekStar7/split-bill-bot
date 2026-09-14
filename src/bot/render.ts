import { formatMoney } from '../core/money.js';
import { reconcile } from '../core/split.js';
import type { Bill, SplitResult } from '../core/types.js';

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

export function renderBill(bill: Bill): string {
  const cur = bill.currency;
  const names = new Map(bill.participants.map((p) => [p.userId, p.displayName]));

  const lines = bill.items.map((it) => {
    const qty = it.qty !== 1 ? ` ×${it.qty}` : '';
    let who = '';
    if (it.shared) who = ' — 🌐 общая';
    else if (bill.mode === 'itemized' && it.claimedBy.length) {
      who = ' — ' + it.claimedBy.map((u) => esc(names.get(u) ?? u)).join(', ');
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
    `Участники (${bill.participants.length}): ${bill.participants.map((p) => esc(p.displayName)).join(', ')}`,
    bill.mode === 'itemized' && bill.status === 'assigning'
      ? '\n👇 Отметьте свои позиции кнопками ниже'
      : '',
  ]
    .filter((l) => l !== null)
    .join('\n')
    .trim();
}

export function renderResult(bill: Bill, result: SplitResult): string {
  const cur = bill.currency;
  const rows = result.settlements
    .sort((a, b) => b.amount - a.amount)
    .map((s) => {
      const items = s.lines
        .map((l) => (l.splitBetween > 1 ? `${esc(l.title)} ÷${l.splitBetween}` : esc(l.title)))
        .join(', ');
      const adj = s.adjustments ? ` + сервис ${formatMoney(s.adjustments)}` : '';
      return `<b>${esc(s.displayName)}</b> — <b>${formatMoney(s.amount, cur)}</b>\n<i>${items}${adj}</i>`;
    });

  const diff = reconcile(bill, result);
  const check =
    diff === 0
      ? `✔ Сходится с чеком: ${formatMoney(bill.total, cur)}`
      : `⚠️ Расхождение с чеком: ${formatMoney(diff, cur)} (в чеке ${formatMoney(bill.total, cur)}, посчитано ${formatMoney(result.total, cur)})`;

  const unclaimed = result.unclaimedItemIdx.length
    ? `\nℹ️ Позиции ${result.unclaimedItemIdx.join(', ')} никто не отметил — разделены на всех.`
    : '';

  return [`💰 <b>Итого к оплате</b>`, '', ...rows, '', check + unclaimed].join('\n');
}
