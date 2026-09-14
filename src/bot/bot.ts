import { apiThrottler } from '@grammyjs/transformer-throttler';
import { Bot, Composer } from 'grammy';
import type { BotContext, Deps } from './context.js';
import { registerCallbacks } from './handlers/callbacks.js';
import { registerDebtors } from './handlers/debtors.js';
import { registerPhoto } from './handlers/photo.js';
import { registerStart } from './handlers/start.js';

export function createBot(deps: Deps): Bot<BotContext> {
  const bot = new Bot<BotContext>(deps.config.BOT_TOKEN);

  // Telegram flood-limits edits to the same message (~1/s) and group messages overall.
  // Queue + auto-retry outgoing API calls instead of crashing on 429.
  bot.api.config.use(apiThrottler());

  bot.use((ctx, next) => {
    ctx.deps = deps;
    // One line per update — enough to tell "never arrived" from "arrived and was ignored".
    deps.log.info(
      { update: ctx.update.update_id, chatId: ctx.chat?.id, chatType: ctx.chat?.type, from: ctx.from?.id },
      ctx.message ? 'message' : ctx.callbackQuery ? 'callback' : 'update',
    );
    return next();
  });

  const composer = new Composer<BotContext>();
  registerStart(composer);
  registerPhoto(composer);
  registerCallbacks(composer);
  registerDebtors(composer);
  bot.use(composer);

  bot.catch((err) => {
    deps.log.error({ err: err.error, update: err.ctx.update.update_id }, 'unhandled bot error');
  });

  return bot;
}
