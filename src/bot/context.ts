import type { Context } from 'grammy';
import type { Logger } from 'pino';
import type { Config } from '../config.js';
import type { Participant } from '../core/types.js';
import type { OcrClient } from '../ocr/claude.js';
import type { BillService } from '../services/bill-service.js';

export interface Deps {
  config: Config;
  log: Logger;
  ocr: OcrClient;
  bills: BillService;
}

export type BotContext = Context & { deps: Deps };

export function participantFrom(ctx: Context): Participant {
  const u = ctx.from;
  if (!u) throw new Error('No sender');
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `id${u.id}`;
  return { userId: String(u.id), displayName: name };
}
