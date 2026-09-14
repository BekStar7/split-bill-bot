import type { Composer } from 'grammy';
import { participantFrom, type BotContext } from '../context.js';
import { billKeyboard } from '../keyboards.js';
import { renderBill } from '../render.js';

export function registerPhoto(bot: Composer<BotContext>): void {
  bot.on('message:photo', async (ctx) => {
    const { ocr, bills, config, log } = ctx.deps;

    // In groups, react only to photos that mention the bot or are captioned with "чек"/"счет"
    // to avoid burning API credits on random photos. In private chats — always.
    if (ctx.chat.type !== 'private' && !looksLikeBillRequest(ctx)) return;

    const status = await ctx.reply('🔍 Читаю чек…', { reply_to_message_id: ctx.message.message_id });

    try {
      const photo = ctx.message.photo.at(-1)!; // largest size
      const file = await ctx.api.getFile(photo.file_id);
      const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());

      const parsed = await ocr.parseReceipt(buf, 'image/jpeg');
      log.info({ chatId: ctx.chat.id, items: parsed.items.length, total: parsed.total }, 'receipt parsed');

      const bill = bills.createFromParsed(parsed, {
        chatId: ctx.chat.id,
        creator: participantFrom(ctx),
        currency: config.CURRENCY,
      });

      const msg = await ctx.api.editMessageText(ctx.chat.id, status.message_id, renderBill(bill), {
        parse_mode: 'HTML',
        reply_markup: billKeyboard(bill),
      });
      if (typeof msg === 'object') bills.attachMessage(bill.id, msg.message_id);

      if (parsed.notes) {
        await ctx.reply(`ℹ️ ${parsed.notes}`, { reply_to_message_id: status.message_id });
      }
    } catch (err) {
      log.error({ err }, 'failed to parse receipt');
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        '😕 Не смог прочитать чек. Попробуй фото получше — ровно, без бликов, весь чек в кадре.',
      );
    }
  });
}

function looksLikeBillRequest(ctx: BotContext): boolean {
  const caption = ctx.message?.caption?.toLowerCase() ?? '';
  const me = ctx.me.username.toLowerCase();
  return caption.includes(`@${me}`) || /чек|счет|счёт|bill|split/.test(caption);
}
