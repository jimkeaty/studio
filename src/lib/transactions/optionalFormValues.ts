import { z } from 'zod';

/**
 * React form controls often represent "not selected" as an empty string, while
 * older Firestore records can contain booleans or other malformed values. These
 * fields are optional business details, so invalid legacy values must never
 * prevent a status change or TC-queue submission.
 */
export function optionalSelect<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    return (values as readonly string[]).includes(normalized) ? normalized : undefined;
  }, z.enum(values).optional());
}

/**
 * Normalize legacy single-string values to arrays and discard non-array legacy
 * values such as booleans. ShowingTime notification choices are optional.
 */
export const optionalStringArray = z.preprocess((value) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value.trim()) return [value];
  return undefined;
}, z.array(z.string()).optional());
