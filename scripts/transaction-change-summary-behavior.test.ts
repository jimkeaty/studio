import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransactionChangeSummary, transactionChangeUrl } from '../src/lib/transactions/changeSummary';

test('change summary reports operational before-and-after values and chooses the relevant section', () => {
  const summary = buildTransactionChangeSummary(
    { status: 'active', salePrice: 350000, projectedCloseDate: '2026-10-21' },
    { status: 'pending', salePrice: 365000, projectedCloseDate: '2026-10-28' },
    ['status', 'salePrice', 'projectedCloseDate'],
  );

  assert.equal(summary.hasChanges, true);
  assert.equal(summary.section, 'transaction-details');
  assert.match(summary.body, /Status: Active → Pending/);
  assert.match(summary.body, /Sale Price: \$350,000\.00 → \$365,000\.00/);
  assert.match(summary.body, /Projected Close Date: Oct 21, 2026 → Oct 28, 2026/);
});

test('change summary names document additions but does not include sensitive client values', () => {
  const summary = buildTransactionChangeSummary(
    { buyerEmail: 'buyer@example.com', documents: [{ name: 'Purchase Agreement.pdf' }] },
    { buyerEmail: 'private@example.com', documents: [{ name: 'Purchase Agreement.pdf' }, { name: 'Amendment 1.pdf' }] },
    ['buyerEmail', 'documents'],
  );

  assert.equal(summary.hasChanges, true);
  assert.match(summary.body, /Documents: 1 added \(Amendment 1\.pdf\)/);
  assert.doesNotMatch(summary.body, /buyer@example\.com|private@example\.com/);
});

test('change summary suppresses no-op and internal calculated fields', () => {
  const summary = buildTransactionChangeSummary(
    { salePrice: 100000, splitSnapshot: { agentNetCommission: 2500 } },
    { salePrice: 100000, splitSnapshot: { agentNetCommission: 3000 } },
    ['salePrice', 'splitSnapshot', 'updatedAt'],
  );

  assert.equal(summary.hasChanges, false);
  assert.equal(summary.body, '');
});

test('change links preserve transaction identity and target the relevant form section', () => {
  assert.equal(
    transactionChangeUrl('transaction-123', 'commission-fees'),
    '/dashboard/transactions/new?edit=transaction-123&focus=commission-fees',
  );
  assert.equal(
    transactionChangeUrl('transaction-123', 'documents', 'staff', 'staff-item-123'),
    '/dashboard/transactions/new?edit=transaction-123&focus=documents&role=staff&intakeId=staff-item-123',
  );
});
