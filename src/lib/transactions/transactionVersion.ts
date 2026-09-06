/**
 * Normalizes Firestore Date/Timestamp values and serialized ISO strings for
 * optimistic-concurrency checks on the canonical transaction document.
 */
export function normalizeTransactionVersion(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date ? date.toISOString() : '';
  }
  return '';
}

/** A missing legacy client version is allowed; a supplied mismatched version is not. */
export function hasTransactionVersionConflict(currentValue: unknown, expectedValue: unknown): boolean {
  const expected = normalizeTransactionVersion(expectedValue);
  if (!expected) return false;
  const current = normalizeTransactionVersion(currentValue);
  return Boolean(current && current !== expected);
}
