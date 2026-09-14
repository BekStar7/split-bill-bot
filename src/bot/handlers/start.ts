import type { Composer } from 'grammy';
import type { BotContext } from '../context.js';

const HELP = `👋 Я делю счета в чате.

1. Кинь фото чека в группу — я распознаю позиции.
2. Все, кто участвует, жмут «Я участвую».
3. Выбери режим: <b>Поровну</b> или <b>Каждый своё</b>.
4. В режиме «Каждый своё» отметьте свои позиции. Кнопка 🌐 делает позицию общей (кальян, хлеб) — она разделится на всех.
5. Жми «Посчитать» — покажу, кто сколько должен. Сервис и скидки делятся пропорционально.

Команды:
/help — эта справка`;

export function registerStart(bot: Composer<BotContext>): void {
  bot.command(['start', 'help'], (ctx) => ctx.reply(HELP, { parse_mode: 'HTML' }));
}
