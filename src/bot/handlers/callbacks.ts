import type { Composer } from 'grammy';
import { GrammyError } from 'grammy';
import { splitBill } from '../../core/split.js';
import type { Bill } from '../../core/types.js';
import { BillNotFound } from '../../services/bill-service.js';
import { participantFrom, type BotContext } from '../context.js';
import { CB_RE, billKeyboard, resultKeyboard } from '../keyboards.js';
import { renderBill, renderClosed, renderResult } from '../render.js';

/**
 * Telegram shows a spinner on the tapped button until we answer the callback query.
 * That's our loader: we deliberately answer only after the message has actually been
 * re-rendered, so the spinner stays visible through the debounce + throttler queue and
 * disappears exactly when the user sees the change. Early exits (toasts for errors and
 * permission denials) still answer immediately.
 */
export function registerCallbacks(bot: Composer<BotContext>): void {
  bot.callbackQuery(CB_RE, async (ctx) => {
    const { bills } = ctx.deps;
    const [, action, billId, arg] = ctx.match;
    if (action === 'n') return answer(ctx);

    const me = participantFrom(ctx);

    let bill: Bill;
    try {
      bill = bills.get(billId!);
    } catch (e) {
      if (e instanceof BillNotFound) return answer(ctx, 'Этот счёт уже не активен');
      throw e;
    }

    if (bill.status === 'done' && action !== 'p') return answer(ctx, 'Счёт уже посчитан');

    const managerOnly = () => {
      if (bills.canManage(bill, me.userId)) return true;
      void answer(ctx, 'Это может сделать только тот, кто загрузил чек');
      return false;
    };

    let toast: string | undefined;

    switch (action) {
      case 'j': {
        bill = bills.toggleParticipant(billId!, me);
        const joined = bill.participants.some((p) => p.userId === me.userId);
        toast = joined ? 'Ты в списке ✅' : 'Ты вышел из счёта';
        break;
      }
      case 'm': {
        if (!managerOnly()) return;
        bill = bills.setMode(billId!, arg === 'i' ? 'itemized' : 'equal');
        break;
      }
      case 't': {
        const wasIn = bill.participants.some((p) => p.userId === me.userId);
        bill = bills.toggleClaim(billId!, Number(arg), me);
        const isIn = bill.participants.some((p) => p.userId === me.userId);
        if (!wasIn && isIn) toast = 'Добавил тебя в счёт ✅';
        else if (wasIn && !isIn) toast = 'Ты вышел из счёта';
        break;
      }
      case 'c': {
        if (!managerOnly()) return;
        if (bill.status === 'draft') return answer(ctx, 'Сначала выбери режим');
        const { bill: done, result } = bills.calculate(billId!);
        cancelPendingEdit(done.id);
        try {
          await safeEdit(ctx, renderClosed(done), billKeyboard(done));
          const sent = await ctx.reply(renderResult(done, result), {
            parse_mode: 'HTML',
            reply_markup: resultKeyboard(done, result, ctx.me.username),
          });
          bills.attachResultMessage(done.id, sent.message_id);
        } finally {
          await answer(ctx);
        }
        return;
      }
      case 'p': {
        const targetUserId = arg!;
        const isManager = bills.canManage(bill, me.userId);
        const alreadyPaid = (bill.paid ?? []).includes(targetUserId);

        // Marking yourself paid is self-service; un-marking (cancelling a payment) is only
        // for whoever loaded the chek, so nobody can dodge their debt by un-checking it.
        if (alreadyPaid ? !isManager : targetUserId !== me.userId && !isManager) {
          return answer(
            ctx,
            alreadyPaid ? 'Отменить оплату может только тот, кто загрузил чек' : 'Отметить может только сам человек или тот, кто загрузил чек',
          );
        }
        const updated = bills.togglePaid(billId!, targetUserId);
        const isPaid = (updated.paid ?? []).includes(targetUserId);
        await scheduleResultEdit(ctx, updated);
        await answer(ctx, isPaid ? 'Отмечено как оплачено ✅' : 'Отметка снята');
        return;
      }
    }

    await scheduleEdit(ctx, bill);
    await answer(ctx, toast);
  });
}

/** Stops the button spinner; optionally shows a toast. Tolerates queries that already expired client-side. */
async function answer(ctx: BotContext, text?: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery(text ? { text } : {});
  } catch (e) {
    if (e instanceof GrammyError && e.description.includes('query is too old')) return;
    throw e;
  }
}

/** editMessageText throws if nothing changed — that's fine, swallow it. */
async function safeEdit(ctx: BotContext, text: string, reply_markup: ReturnType<typeof billKeyboard>) {
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
  } catch (e) {
    if (e instanceof GrammyError && e.description.includes('message is not modified')) return;
    throw e;
  }
}

// Several people can toggle items on the same bill within milliseconds of each other.
// Editing the same message on every single click blows through Telegram's flood limit
// (~1 edit/sec per message), so we coalesce rapid updates into one trailing edit.
// Every caller gets the same promise, which resolves once that edit has gone out.
const EDIT_DEBOUNCE_MS = 600;

interface PendingEdit {
  timer: NodeJS.Timeout;
  bill: Bill;
  done: Promise<void>;
  resolve: () => void;
}

const pendingEdits = new Map<string, PendingEdit>();

function scheduleEdit(ctx: BotContext, bill: Bill): Promise<void> {
  const pending = pendingEdits.get(bill.id);
  if (pending) {
    pending.bill = bill;
    return pending.done;
  }

  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const entry: PendingEdit = {
    bill,
    done,
    resolve,
    timer: setTimeout(() => {
      pendingEdits.delete(bill.id);
      void editBillMessage(ctx, entry.bill).then(resolve);
    }, EDIT_DEBOUNCE_MS),
  };
  pendingEdits.set(bill.id, entry);
  return done;
}

/** Never rejects — a failed edit is logged, and the callers still get their spinners cleared. */
async function editBillMessage(ctx: BotContext, bill: Bill): Promise<void> {
  if (!bill.messageId) return;
  try {
    await ctx.api.editMessageText(bill.chatId, bill.messageId, renderBill(bill), {
      parse_mode: 'HTML',
      reply_markup: billKeyboard(bill),
    });
  } catch (e) {
    if (e instanceof GrammyError && e.description.includes('message is not modified')) return;
    ctx.deps.log.error({ err: e }, 'failed to edit bill message');
  }
}

/** Drops a queued re-render (e.g. the bill just got calculated) and releases anyone waiting on it. */
function cancelPendingEdit(billId: string): void {
  const pending = pendingEdits.get(billId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingEdits.delete(billId);
  pending.resolve();
}

// Same coalescing scheme as above, but for the "💰 Итого к оплате" message — several people
// can tap "paid" on the same bill within milliseconds of each other.
const pendingResultEdits = new Map<string, PendingEdit>();

function scheduleResultEdit(ctx: BotContext, bill: Bill): Promise<void> {
  const pending = pendingResultEdits.get(bill.id);
  if (pending) {
    pending.bill = bill;
    return pending.done;
  }

  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const entry: PendingEdit = {
    bill,
    done,
    resolve,
    timer: setTimeout(() => {
      pendingResultEdits.delete(bill.id);
      void editResultMessage(ctx, entry.bill).then(resolve);
    }, EDIT_DEBOUNCE_MS),
  };
  pendingResultEdits.set(bill.id, entry);
  return done;
}

/** Never rejects — a failed edit is logged, and the callers still get their spinners cleared. */
async function editResultMessage(ctx: BotContext, bill: Bill): Promise<void> {
  if (!bill.resultMessageId) return;
  const result = splitBill(bill);
  try {
    await ctx.api.editMessageText(bill.chatId, bill.resultMessageId, renderResult(bill, result), {
      parse_mode: 'HTML',
      reply_markup: resultKeyboard(bill, result, ctx.me.username),
    });
  } catch (e) {
    if (e instanceof GrammyError && e.description.includes('message is not modified')) return;
    ctx.deps.log.error({ err: e }, 'failed to edit result message');
  }
}
