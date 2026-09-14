import type { Composer } from 'grammy';
import { GrammyError } from 'grammy';
import type { Bill } from '../../core/types.js';
import { BillNotFound } from '../../services/bill-service.js';
import { participantFrom, type BotContext } from '../context.js';
import { CB_RE, billKeyboard } from '../keyboards.js';
import { renderBill, renderResult } from '../render.js';

export function registerCallbacks(bot: Composer<BotContext>): void {
  bot.callbackQuery(CB_RE, async (ctx) => {
    const { bills } = ctx.deps;
    const [, action, billId, arg] = ctx.match;
    const me = participantFrom(ctx);

    let bill: Bill;
    try {
      bill = bills.get(billId!);
    } catch (e) {
      if (e instanceof BillNotFound) return ctx.answerCallbackQuery({ text: 'Этот счёт уже не активен' });
      throw e;
    }

    if (bill.status === 'done') return ctx.answerCallbackQuery({ text: 'Счёт уже посчитан' });

    const managerOnly = () => {
      if (bills.canManage(bill, me.userId)) return true;
      void ctx.answerCallbackQuery({ text: 'Это может сделать только тот, кто загрузил чек' });
      return false;
    };

    switch (action) {
      case 'j': {
        bill = bills.toggleParticipant(billId!, me);
        const joined = bill.participants.some((p) => p.userId === me.userId);
        await ctx.answerCallbackQuery({ text: joined ? 'Ты в списке ✅' : 'Ты вышел из счёта' });
        break;
      }
      case 'm': {
        if (!managerOnly()) return;
        bill = bills.setMode(billId!, arg === 'i' ? 'itemized' : 'equal');
        await ctx.answerCallbackQuery();
        break;
      }
      case 't': {
        if (!bill.participants.some((p) => p.userId === me.userId)) {
          return ctx.answerCallbackQuery({ text: 'Сначала нажми «Я участвую»' });
        }
        bill = bills.toggleClaim(billId!, Number(arg), me.userId);
        await ctx.answerCallbackQuery();
        break;
      }
      case 's': {
        if (!managerOnly()) return;
        bill = bills.toggleShared(billId!, Number(arg));
        await ctx.answerCallbackQuery();
        break;
      }
      case 'c': {
        if (!managerOnly()) return;
        if (bill.status === 'draft') {
          return ctx.answerCallbackQuery({ text: 'Сначала выбери режим' });
        }
        const { bill: done, result } = bills.calculate(billId!);
        await ctx.answerCallbackQuery();
        await safeEdit(ctx, renderBill(done), billKeyboard(done));
        await ctx.reply(renderResult(done, result), {
          parse_mode: 'HTML',
          ...(done.messageId ? { reply_to_message_id: done.messageId } : {}),
        });
        return;
      }
    }

    await safeEdit(ctx, renderBill(bill), billKeyboard(bill));
  });
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
