import { Bot, Composer } from 'grammy';
import type { BotContext, Deps } from './context.js';
import { registerCallbacks } from './handlers/callbacks.js';
import { registerPhoto } from './handlers/photo.js';
import { registerStart } from './handlers/start.js';

export function createBot(deps: Deps): Bot<BotContext> {
  const bot = new Bot<BotContext>(deps.config.BOT_TOKEN);

  bot.use((ctx, next) => {
    ctx.deps = deps;
    return next();
  });

  const composer = new Composer<BotContext>();
  registerStart(composer);
  registerPhoto(composer);
  registerCallbacks(composer);
  bot.use(composer);

  bot.catch((err) => {
    deps.log.error({ err: err.error, update: err.ctx.update.update_id }, 'unhandled bot error');
  });

  return bot;
}
