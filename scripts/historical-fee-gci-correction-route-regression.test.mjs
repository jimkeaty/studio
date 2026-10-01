import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const route = readFileSync(
  new URL('../src/app/api/admin/transactions/historical-fee-gci-correction/route.ts', import.meta.url),
  'utf8',
);
const correction = readFileSync(
  new URL('../src/lib/transactions/historicalFeeGciCorrection.ts', import.meta.url),
  'utf8',
);

test('historical fee correction route is admin-only, closed-manifest, and version-safe', () => {
  assert.match(route, /isAdminLike/);
  assert.match(route, /requireApprovedHistoricalFeeManifest/);
  assert.match(route, /adminDb\.runTransaction/);
  assert.match(correction, /expectedUpdatedAt/);
  assert.match(correction, /changed after the audit/);
  assert.match(correction, /APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS/);
  assert.match(correction, /JpTYOQ5WcUoS0D96uY4o/);
  assert.match(correction, /jd4NBEj0jKzYYsoj9BGN/);
});

test('historical fee correction preserves payouts and does not trigger operational workflow side effects', () => {
  assert.match(correction, /agentNetCommission: prepared\.after\.agentNetCommission/);
  assert.match(correction, /companyRetained: prepared\.after\.companyRetained/);
  assert.match(correction, /grossCommission: prepared\.after\.grossCommission/);
  assert.match(route, /rebuildAgentRollup/);
  assert.match(route, /auditEvents/);
  assert.doesNotMatch(route, /reopenTcIntakeForTransaction/);
  assert.doesNotMatch(route, /sendNotification/);
  assert.doesNotMatch(route, /resolveTransactionCalculation/);
});
