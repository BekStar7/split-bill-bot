import type { Composer } from 'grammy';
import { BillNotFound } from '../../services/bill-service.js';
import type { BotContext } from '../context.js';
import { renderDebtors } from '../render.js';

/** /debtors — who still owes on the last calculated bill in this chat, with a ping to nudge them. */
export function registerDebtors(bot: Composer<BotContext>): void {
  bot.command('debtors', async (ctx) => {
    let found;
    try {
      found = ctx.deps.bills.latestForChat(ctx.chat!.id);
    } catch (e) {
      if (e instanceof BillNotFound) return ctx.reply('Тут ещё нет посчитанного чека 🤷');
      throw e;
    }
    await ctx.reply(renderDebtors(found.bill, found.result), { parse_mode: 'HTML' });
  });
}
