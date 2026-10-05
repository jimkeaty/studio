import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveOutboundReferral } from '../src/lib/transactions/outboundReferral';

const tcApprovalRoute = readFileSync(
  new URL('../src/app/api/admin/tc/[id]/route.ts', import.meta.url),
  'utf8',
);

function approvalSource(): string {
  const start = tcApprovalRoute.indexOf("if (action === 'approve')");
  const end = tcApprovalRoute.indexOf('// ── COMMISSION OVERRIDE', start);
  assert.ok(start >= 0, 'TC approval branch must exist');
  assert.ok(end > start, 'TC approval branch must terminate before commission overrides');
  return tcApprovalRoute.slice(start, end);
}

test('a transaction without an outbound referral resolves to a full, non-deducted commission base', () => {
  const referral = resolveOutboundReferral(
    {
      hasOutboundReferral: false,
      outboundReferralFeePercent: null,
      outboundReferralFeeDollar: null,
    },
    9000,
  );

  assert.deepEqual(referral, {
    active: false,
    referralFeePercent: null,
    referralFeeDollar: null,
    netAfterReferral: 9000,
  });
});

test('TC approval defines referral normalization before both override and automatic branches', () => {
  const approval = approvalSource();
  const rawGciIndex = approval.indexOf('const rawGci = resolveGCI({');
  const referralIndex = approval.indexOf('const referral = resolveOutboundReferral(intake, rawGci);');
  const overrideIndex = approval.indexOf('if (intake.commissionOverride');
  const payloadIndex = approval.indexOf('hasOutboundReferral: referral.active');

  assert.ok(rawGciIndex >= 0, 'Approval must calculate its canonical GCI first');
  assert.ok(referralIndex > rawGciIndex, 'Referral normalization must use the canonical GCI');
  assert.ok(referralIndex < overrideIndex, 'Referral normalization must be available to an override approval');
  assert.ok(payloadIndex > overrideIndex, 'Approval payload must preserve the normalized referral result');
  assert.doesNotMatch(approval, /if \(!referral\)/, 'No-referral approvals must not require referral data');
});
