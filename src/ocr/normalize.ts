import type { ParsedBill } from './schema.js';

/**
 * OCR sometimes files the same receipt line under two heads — e.g. a 10% "надбавка"
 * reported as both serviceFeeAbs and discountAbs, which then cancel out. The printed
 * grand total is the most reliable number on a receipt, so we pick the combination of
 * (fee, discount) that lands closest to it. Ties keep what the model said.
 */
export function normalizeParsed(parsed: ParsedBill): ParsedBill {
  const itemsSum = parsed.items.reduce((s, i) => s + i.amount, 0);

  const feeOptions: Array<{ abs: number | null; pct: number | null }> = [
    { abs: parsed.serviceFeeAbs, pct: parsed.serviceFeePct }, // as reported
  ];
  if (parsed.serviceFeeAbs != null && parsed.serviceFeePct != null) {
    feeOptions.push({ abs: null, pct: parsed.serviceFeePct }); // trust the percent instead
  }
  if (parsed.serviceFeeAbs != null || parsed.serviceFeePct != null) {
    feeOptions.push({ abs: null, pct: null }); // no fee at all
  }

  const discountOptions: Array<number | null> = [parsed.discountAbs];
  if (parsed.discountAbs != null) discountOptions.push(null);

  let best: { fee: (typeof feeOptions)[number]; discount: number | null; gap: number } = {
    fee: feeOptions[0]!,
    discount: parsed.discountAbs,
    gap: Infinity,
  };
  for (const fee of feeOptions) {
    const feeAmount = fee.abs ?? (fee.pct != null ? Math.round((itemsSum * fee.pct) / 100) : 0);
    for (const discount of discountOptions) {
      const gap = Math.abs(itemsSum + feeAmount - (discount ?? 0) - parsed.total);
      if (gap < best.gap) best = { fee, discount, gap };
    }
  }

  return { ...parsed, serviceFeeAbs: best.fee.abs, serviceFeePct: best.fee.pct, discountAbs: best.discount };
}
