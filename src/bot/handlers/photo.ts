import type { Composer, Context } from 'grammy';
import type { PhotoSize } from 'grammy/types';
import { participantFrom, type BotContext } from '../context.js';
import { billKeyboard } from '../keyboards.js';
import { renderBill } from '../render.js';

export function registerPhoto(bot: Composer<BotContext>): void {
  bot.on('message:photo', async (ctx) => {
    // In groups, react only to photos whose caption mentions the bot — never to random photos
    // or to words like "чек", which come up in normal conversation. In private chats — always.
    if (ctx.chat.type !== 'private' && !mentionsBot(ctx, ctx.message.caption)) {
      ctx.deps.log.info({ chatId: ctx.chat.id }, 'group photo ignored: bot not mentioned in caption');
      return;
    }

    const photo = ctx.message.photo.at(-1)!; // largest size
    await processReceiptPhoto(ctx, photo, ctx.message.message_id);
  });

  // Replying "@bot" to an earlier photo message also triggers processing —
  // useful when the photo was sent without a caption. Any other text addressed to the bot
  // (mention in a group, anything in private) gets a hint about what it expects.
  bot.on('message:text', async (ctx, next) => {
    // Slash commands (e.g. /debtors@bot) have their own handlers registered later in the chain.
    // Returning here without calling next() would swallow the update instead of forwarding it.
    if (ctx.message.entities?.some((e) => e.type === 'bot_command' && e.offset === 0)) return next();

    const inGroup = ctx.chat.type !== 'private';
    if (inGroup && !mentionsBot(ctx, ctx.message.text)) return;

    // A reply to a message the bot received arrives as reply_to_message. A reply to one it
    // never saw (posted before it joined the chat) comes as external_reply, or as no reply at all.
    const { reply_to_message: replied, external_reply: external } = ctx.message;
    const replyPhoto = replied?.photo ?? external?.photo;

    if (!replyPhoto) {
      ctx.deps.log.info(
        { chatId: ctx.chat.id, isReply: Boolean(replied || external), keys: Object.keys(ctx.message) },
        'mention without a readable photo',
      );
      const how = inGroup ? `с подписью @${ctx.me.username}` : 'сюда';
      const text =
        replied || external
          ? `Не вижу фото в этом сообщении 🙈 Если чек прислали до того, как меня добавили в чат, я не могу его прочитать — пришли фото ещё раз ${how}.`
          : `Пришли фото чека ${how} — или ответь @${ctx.me.username} на сообщение с фото.`;
      await ctx.reply(text, { reply_to_message_id: ctx.message.message_id });
      return;
    }

    const photo = replyPhoto.at(-1)!; // largest size
    await processReceiptPhoto(ctx, photo, ctx.message.message_id);
  });
}

async function processReceiptPhoto(ctx: BotContext, photo: PhotoSize, replyToMessageId: number): Promise<void> {
  const { ocr, bills, config, log } = ctx.deps;
  const chatId = ctx.chat!.id;
  log.info({ chatId, chatType: ctx.chat!.type, from: ctx.from?.id }, 'processing receipt photo');

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

    // OCR notes are the model's reasoning about fees/discounts — useful for debugging a bad
    // parse, but noise in the chat. Keep them in the log only.
    if (parsed.notes) log.info({ chatId, notes: parsed.notes }, 'ocr notes');
  } catch (err) {
    log.error({ err }, 'failed to parse receipt');
    await ctx.api.editMessageText(
      chatId,
      status.message_id,
      '😕 Не смог прочитать чек. Попробуй фото получше — ровно, без бликов, весь чек в кадре.',
    );
  }
}

function mentionsBot(ctx: Context, text: string | undefined): boolean {
  const t = text?.toLowerCase() ?? '';
  return t.includes(`@${ctx.me.username.toLowerCase()}`);
}
