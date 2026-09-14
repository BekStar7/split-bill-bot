import { run } from '@grammyjs/runner';
import pino from 'pino';
import { createBot } from './bot/bot.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { BillRepo } from './db/repo.js';
import { createClaudeOcr } from './ocr/claude.js';
import { BillService } from './services/bill-service.js';

const config = loadConfig();
const log = pino({
  level: config.LOG_LEVEL,
  ...(process.env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty' } } : {}),
});

const db = createDb(config.DATABASE_PATH);
const bills = new BillService(new BillRepo(db));
const ocr = createClaudeOcr({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL });

const bot = createBot({ config, log, ocr, bills });

await bot.api.setMyCommands([{ command: 'help', description: 'Как пользоваться ботом' }]);

const runner = run(bot);
log.info('bot started (long polling)');

const stop = () => {
  log.info('shutting down');
  if (runner.isRunning()) void runner.stop();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
