import Anthropic from '@anthropic-ai/sdk';
import { parsedBillJsonSchema, parsedBillSchema, type ParsedBill } from './schema.js';

const SYSTEM_PROMPT = `You extract structured data from photos of restaurant receipts (Kazakhstan, Russia, CIS — text may be in Russian, Kazakh or English).
Rules:
- Return every purchased line item. Skip headers, addresses, tax IDs, payment method lines.
- Prices are whole currency units (tenge/rubles). Drop kopecks/tiyn by rounding.
- If a line shows quantity (×2, 2 шт, 2 x), report qty and unitPrice; amount is the line total.
- "Сервис", "обслуживание", "надбавка", "service charge" is a SURCHARGE added to the bill → serviceFeeAbs if a sum is printed (preferred), serviceFeePct if only a percent is printed. Never report it as a discount.
- "Скидка", "discount" is subtracted from the bill → discountAbs as a positive number. Only report it when the receipt has an explicit discount line.
- Each receipt line is either a fee or a discount, never both. Sanity check: sum(items) + service − discount must equal total; if it doesn't, re-read the fee/discount lines.
- total is the final amount the customer pays ("Итого", "К оплате", "Total").
- If unsure about a value, still fill your best guess and describe the doubt in notes.
Always respond by calling the extract_bill tool.`;

export interface OcrClient {
  parseReceipt(image: Buffer, mimeType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<ParsedBill>;
}

export function createClaudeOcr(opts: { apiKey: string; model: string }): OcrClient {
  const client = new Anthropic({ apiKey: opts.apiKey });

  return {
    async parseReceipt(image, mimeType) {
      const res = await client.messages.create({
        model: opts.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: 'extract_bill',
            description: 'Return the parsed receipt',
            input_schema: parsedBillJsonSchema as unknown as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: 'extract_bill' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: image.toString('base64') },
              },
              { type: 'text', text: 'Extract this receipt.' },
            ],
          },
        ],
      });

      const toolUse = res.content.find((c) => c.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('Model did not return structured output');
      }
      return parsedBillSchema.parse(toolUse.input);
    },
  };
}
