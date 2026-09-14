import type { Composer } from 'grammy';
import { BillNotCalculated, BillNotFound } from '../../services/bill-service.js';
import type { BotContext } from '../context.js';
import { DETAILS_PREFIX } from '../keyboards.js';
import { renderMyDetails } from '../render.js';

const HELP = `👋 Я делю счета в чате.

1. Кинь фото чека в группу с подписью @billspliter_bot (или ответь мне так на уже отправленное фото) — я распознаю позиции. В личке подпись не нужна.
2. Все, кто участвует, жмут «Я участвую» — или просто забирают свои позиции, тогда добавлю автоматически.
3. Тот, кто загрузил чек, выбирает режим: <b>Поровну</b> или <b>Каждый своё</b> (только он может менять режим и нажимать «Посчитать»).
4. В режиме «Каждый своё» жми на позицию, чтобы забрать её себе — появится твой эмодзи. Если одну позицию забрали несколько человек, она делится между ними. Если позиций несколько (например, кола ×3), каждый клик берёт ещё одну штуку, а клик сверх свободного снимает тебя. Позиции с 🌐 никто не забрал — они (кальян, хлеб) разделятся на всех поровну.
5. Когда все разобрали свои позиции — «Посчитать» жмёт только тот, кто загрузил чек. В чат придёт, кто сколько должен, а кнопка «Подробнее» покажет тебе здесь, в личке, из чего сложилась твоя сумма.

Команды:
/help — эта справка`;

export function registerStart(bot: Composer<BotContext>): void {
  bot.command('help', (ctx) => ctx.reply(HELP, { parse_mode: 'HTML' }));

  // `/start d_<billId>` comes from the "Подробнее" deep link under a calculated bill.
  bot.command('start', async (ctx) => {
    const payload = ctx.match.trim();
    if (!payload.startsWith(DETAILS_PREFIX)) return ctx.reply(HELP, { parse_mode: 'HTML' });

    const billId = payload.slice(DETAILS_PREFIX.length);
    try {
      const { bill, result } = ctx.deps.bills.result(billId);
      await ctx.reply(renderMyDetails(bill, result, String(ctx.from!.id)), { parse_mode: 'HTML' });
    } catch (e) {
      if (e instanceof BillNotFound) return ctx.reply('Этот счёт уже не найти 🤷');
      if (e instanceof BillNotCalculated) return ctx.reply('Этот счёт ещё не посчитан — подробности появятся после «Посчитать».');
      throw e;
    }
  });
}
