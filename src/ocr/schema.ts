import { z } from 'zod';

export const parsedItemSchema = z.object({
  title: z.string().min(1),
  qty: z.number().positive().default(1),
  unitPrice: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative(),
});

export const parsedBillSchema = z.object({
  items: z.array(parsedItemSchema).min(1),
  /** Service fee percent if printed as %, e.g. 10 */
  serviceFeePct: z.number().nonnegative().nullable().default(null),
  /** Service fee absolute amount if printed as a sum */
  serviceFeeAbs: z.number().int().nonnegative().nullable().default(null),
  discountAbs: z.number().int().nonnegative().nullable().default(null),
  total: z.number().int().nonnegative(),
  currency: z.string().default('KZT'),
  /** Free-text notes from the model about anything ambiguous */
  notes: z.string().nullable().default(null),
});

export type ParsedItem = z.infer<typeof parsedItemSchema>;
export type ParsedBill = z.infer<typeof parsedBillSchema>;

/** JSON schema handed to Claude as a tool definition (structured output). */
export const parsedBillJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'qty', 'unitPrice', 'amount'],
        properties: {
          title: { type: 'string', description: 'Item name as printed, trimmed' },
          qty: { type: 'number', description: 'Quantity, 1 if not printed' },
          unitPrice: { type: 'integer', description: 'Price per unit in whole currency units' },
          amount: { type: 'integer', description: 'Line total (qty × unitPrice) in whole units' },
        },
      },
    },
    serviceFeePct: { type: ['number', 'null'], description: 'Service charge percent if printed as %' },
    serviceFeeAbs: { type: ['integer', 'null'], description: 'Service charge amount if printed as a sum' },
    discountAbs: { type: ['integer', 'null'], description: 'Total discount amount, positive number' },
    total: { type: 'integer', description: 'Grand total to pay as printed' },
    currency: { type: 'string', description: 'ISO code, e.g. KZT' },
    notes: { type: ['string', 'null'], description: 'Anything unclear or unreadable' },
  },
} as const;
