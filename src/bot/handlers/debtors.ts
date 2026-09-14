import type { Composer } from 'grammy';
import type { BotContext } from '../context.js';
import { renderDebtors } from '../render.js';

/** /debtors — everyone who still owes across every calculated bill in this chat, with a ping to nudge them. */
export function registerDebtors(bot: Composer<BotContext>): void {
  bot.command('debtors', async (ctx) => {
    const open = ctx.deps.bills.openForChat(ctx.chat!.id);
    await ctx.reply(renderDebtors(open), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });
}
