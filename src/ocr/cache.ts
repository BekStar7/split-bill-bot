import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type { ReceiptCacheRepo } from '../db/repo.js';
import type { OcrClient } from './claude.js';

/** Wraps an OcrClient so identical photos (same bytes) reuse a previous parse instead of calling the API again. */
export function createCachedOcr(inner: OcrClient, repo: ReceiptCacheRepo, log: Logger): OcrClient {
  return {
    async parseReceipt(image, mimeType) {
      const hash = createHash('sha256').update(image).digest('hex');

      const cached = repo.get(hash);
      if (cached) {
        log.info({ hash }, 'OCR cache hit, skipping Anthropic call');
        return cached;
      }

      const parsed = await inner.parseReceipt(image, mimeType);
      repo.save(hash, parsed);
      return parsed;
    },
  };
}
