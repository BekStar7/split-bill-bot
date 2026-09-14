import { claimCounts, unclaimedUnits, unitCount } from '../core/claims.js';
import { formatMoney } from '../core/money.js';
import { reconcile } from '../core/split.js';
import type { Bill, SplitResult } from '../core/types.js';
import { personEmoji } from './emoji.js';

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

/** Pings the user in the message, even without a @username — works as long as they've sent a message in this chat. */
export const mention = (userId: string, name: string) => `<a href="tg://user?id=${userId}">${esc(name)}</a>`;

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

/** Group message: just who owes what, bucketed by payment status. Per-person breakdown lives in the DM (renderMyDetails). */
export function renderResult(bill: Bill, result: SplitResult): string {
  const cur = bill.currency;
  const paid = new Set(bill.paid ?? []);
  const row = (s: (typeof result.settlements)[number]) =>
    `${mention(s.userId, s.displayName)} — <b>${formatMoney(s.amount, cur)}</b>`;

  const sorted = [...result.settlements].sort((a, b) => b.amount - a.amount);
  const paidRows = sorted.filter((s) => paid.has(s.userId)).map(row);
  const dueRows = sorted.filter((s) => !paid.has(s.userId)).map(row);

  const sections: string[] = [];
  if (dueRows.length) sections.push('❌ <b>Должны:</b>', ...dueRows);
  if (paidRows.length) {
    if (sections.length) sections.push('');
    sections.push('✅ <b>Оплатили:</b>', ...paidRows);
  }

  return [`💰 <b>Итого к оплате</b>`, '', ...sections, '', renderCheck(bill, result)].join('\n');
}

/**
 * Reply for /debtors: every still-open bill in the chat (someone hasn't marked paid), not just
 * the latest — a chat can rack up two or three checks in one evening. One ping at the end
 * covers everyone across all of them, de-duplicated.
 */
export function renderDebtors(open: Array<{ bill: Bill; result: SplitResult }>): string {
  if (!open.length) return '✅ Все оплатили, долгов нет.';

  const pinged = new Map<string, string>();
  const blocks = open.map(({ bill, result }) => {
    const cur = bill.currency;
    const paid = new Set(bill.paid ?? []);
    const debtors = result.settlements.filter((s) => !paid.has(s.userId));
    for (const s of debtors) pinged.set(s.userId, s.displayName);

    const link = messageLink(bill, bill.resultMessageId ?? bill.messageId);
    const title = `🧾 <b>Чек · ${formatBillDate(bill)}</b>${link ? ` · <a href="${link}">открыть</a>` : ''}`;
    const rows = debtors.map((s) => `${mention(s.userId, s.displayName)} — <b>${formatMoney(s.amount, cur)}</b>`);
    return [title, ...rows].join('\n');
  });

  const ping = [...pinged].map(([userId, name]) => mention(userId, name)).join(', ');

  return ['❌ <b>Должники:</b>', '', blocks.join('\n\n'), '', `Эй, ${ping}, погасите должок 👀`].join('\n');
}

function formatBillDate(bill: Bill): string {
  return new Date(bill.createdAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function messageLink(bill: Bill, messageId: number | undefined): string | undefined {
  const chatId = String(bill.chatId);
  if (!messageId || !chatId.startsWith('-100')) return undefined;
  return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
}

/** DM message: one person's share, line by line. */
export function renderMyDetails(bill: Bill, result: SplitResult, userId: string): string {
  const cur = bill.currency;
  const s = result.settlements.find((x) => x.userId === userId);
  if (!s) return 'Тебя нет в этом счёте 🤷';

  const lines = s.lines.map((l) => {
    const units = l.units && l.units > 1 ? ` ×${l.units}` : '';
    const div = l.splitBetween > 1 ? ` (÷${l.splitBetween})` : '';
    return `• ${esc(l.title)}${units}${div} — ${formatMoney(l.amount, cur)}`;
  });

  const extras: string[] = [];
  if (s.adjustments) {
    const what =
      s.adjustments > 0 ? 'Сервис / надбавки, твоя доля' : 'Скидка, твоя доля';
    extras.push(`${what}: ${formatMoney(s.adjustments, cur)}`);
  }

  const unclaimed = result.unclaimed.length
    ? `\nℹ️ Никто не отметил — разделено на всех: ${result.unclaimed
        .map((u) => `${esc(u.title)}${u.ofUnits > 1 ? ` (${u.units} из ${u.ofUnits})` : ''}`)
        .join(', ')}.`
    : '';

  return [
    `🧾 <b>Твоя часть счёта</b> · итого <b>${formatMoney(s.amount, cur)}</b>`,
    '',
    ...lines,
    `Позиции: ${formatMoney(s.base, cur)}`,
    ...extras,
    '',
    renderCheck(bill, result) + unclaimed,
  ].join('\n');
}

function renderCheck(bill: Bill, result: SplitResult): string {
  const cur = bill.currency;
  const diff = reconcile(bill, result);
  let check: string;
  if (diff !== 0) {
    check = `⚠️ Расхождение с чеком: ${formatMoney(diff, cur)} (в чеке ${formatMoney(bill.total, cur)}, посчитано ${formatMoney(result.total, cur)})`;
  } else if (result.gapAbsorbed) {
    const n = result.settlements.length;
    check =
      result.gap > 0
        ? `✔ Сходится с чеком: ${formatMoney(bill.total, cur)}. В чеке на ${formatMoney(result.gap, cur)} больше, чем сумма позиций и сервиса — разница разделена на всех (${n}) поровну.`
        : `✔ Сходится с чеком: ${formatMoney(bill.total, cur)}. В чеке на ${formatMoney(-result.gap, cur)} меньше, чем сумма позиций и сервиса — разница вычтена у всех (${n}) поровну.`;
  } else {
    check = `✔ Сходится с чеком: ${formatMoney(bill.total, cur)}`;
  }
  return check;
}
