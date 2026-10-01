import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTransactionVersion } from '../src/lib/transactions/transactionVersion';

test('normalizes a legacy JavaScript Date into an optimistic-lock version token', () => {
  const version = normalizeTransactionVersion(new Date('2026-10-01T16:00:00.000Z'));
  assert.equal(version, '2026-10-01T16:00:00.000Z');
});

test('normalizes a Firestore Timestamp-like value into an optimistic-lock version token', () => {
  const version = normalizeTransactionVersion({
    toDate: () => new Date('2026-10-01T16:00:00.000Z'),
  });
  assert.equal(version, '2026-10-01T16:00:00.000Z');
});
