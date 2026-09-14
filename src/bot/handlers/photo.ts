import type { Composer, Context } from 'grammy';
import type { PhotoSize } from 'grammy/types';
import { participantFrom, type BotContext } from '../context.js';
import { billKeyboard } from '../keyboards.js';
import { renderBill } from '../render.js';

export function registerPhoto(bot: Composer<BotContext>): void {
  bot.on('message:photo', async (ctx) => {
    // In groups, react only to photos that mention the bot or are captioned with "чек"/"счет"
    // to avoid burning API credits on random photos. In private chats — always.
    if (ctx.chat.type !== 'private' && !looksLikeBillRequest(ctx, ctx.message.caption)) return;

    const photo = ctx.message.photo.at(-1)!; // largest size
    await processReceiptPhoto(ctx, photo, ctx.message.message_id);
  });

  // Replying with e.g. "чек" to an earlier photo message also triggers processing —
  // useful when the photo was sent without a caption.
  bot.on('message:text', async (ctx) => {
    const replyPhoto = ctx.message.reply_to_message?.photo;
    if (!replyPhoto) return;
    if (ctx.chat.type !== 'private' && !looksLikeBillRequest(ctx, ctx.message.text)) return;

    const photo = replyPhoto.at(-1)!; // largest size
    await processReceiptPhoto(ctx, photo, ctx.message.message_id);
  });
}

async function processReceiptPhoto(ctx: BotContext, photo: PhotoSize, replyToMessageId: number): Promise<void> {
  const { ocr, bills, config, log } = ctx.deps;
  const chatId = ctx.chat!.id;

  const status = await ctx.reply('🔍 Читаю чек…', { reply_to_message_id: replyToMessageId });

  try {
    const file = await ctx.api.getFile(photo.file_id);
    const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    const parsed = await ocr.parseReceipt(buf, 'image/jpeg');
    log.info({ chatId, items: parsed.items.length, total: parsed.total }, 'receipt parsed');

    const bill = bills.createFromParsed(parsed, {
      chatId,
      creator: participantFrom(ctx),
      currency: config.CURRENCY,
    });

    const msg = await ctx.api.editMessageText(chatId, status.message_id, renderBill(bill), {
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
      chatId,
      status.message_id,
      '😕 Не смог прочитать чек. Попробуй фото получше — ровно, без бликов, весь чек в кадре.',
    );
  }
}

function looksLikeBillRequest(ctx: Context, text: string | undefined): boolean {
  const t = text?.toLowerCase() ?? '';
  const me = ctx.me.username.toLowerCase();
  return t.includes(`@${me}`) || /чек|счет|счёт|bill|split/.test(t);
}
