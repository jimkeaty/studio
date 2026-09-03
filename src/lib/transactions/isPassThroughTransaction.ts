import { normalizeDealSource } from '@/lib/normalizeDealSource';

/**
 * Pass-throughs receive sales and sale-price-volume recognition, but never
 * generate agent income, brokerage revenue, GCI, or commission-tier credit.
 * Older records may use a legacy boolean or a deal-source label, so every
 * reporting path must resolve the flag in one place.
 */
export function isPassThroughTransaction(transaction: unknown): boolean {
  const tx = (transaction ?? {}) as {
    isPassThrough?: unknown;
    passThrough?: unknown;
    dealSource?: unknown;
  };

  return Boolean(tx.isPassThrough)
    || Boolean(tx.passThrough)
    || normalizeDealSource(String(tx.dealSource ?? '')) === 'pass_through';
}
