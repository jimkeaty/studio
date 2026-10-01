import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAccountingSnapshot, requiredAccountingFieldsMissing } from '../src/lib/transactions/accountingCloseout';

function fieldMap(transaction: Record<string, any>) {
  return new Map(buildAccountingSnapshot(transaction, 'accounting-test-001').fields.map((field) => [field.id, field]));
}

test('Accounting Closeout derives the requested review values from the canonical transaction and split snapshot', () => {
  const fields = fieldMap({
    propertyAddress: '123 Example Street, Lafayette, LA 70501',
    clientName: 'Avery Buyer',
    buyer2Name: 'Blake Buyer',
    dealSource: 'Sphere of influence',
    agentDisplayName: 'Primary Agent',
    coAgentDisplayName: 'Co-Agent',
    status: 'closed',
    listingDate: '2026-08-01',
    contractDate: '2026-08-15',
    projectedCloseDate: '2026-09-10',
    listingExpirationDate: '2026-12-01',
    closedDate: '2026-09-08',
    listPrice: 410000,
    salePrice: 400000,
    commissionPercent: 3,
    txComplianceFeeAmount: 395,
    txComplianceFeePaidBy: 'Buyer',
    listingFee: 150,
    listingFeePaidBy: 'Seller',
    hasOutboundReferral: true,
    outboundReferralAgentName: 'Referral Partner',
    outboundReferralFeePercent: 25,
    agentBonusPassThrough: 3000,
    agentId: 'primary-agent',
    isInHouse: false,
    splitSnapshot: {
      companySplitPercent: 30,
      companyRetained: 3600,
      agentSplitPercent: 70,
      agentNetCommission: 8400,
    },
  });

  assert.equal(fields.get('propertyAddress')?.value, '123 Example Street, Lafayette, LA 70501');
  assert.equal(fields.get('clientNames')?.value, 'Avery Buyer, Blake Buyer');
  assert.equal(fields.get('leadSource')?.value, 'Sphere of influence');
  assert.equal(fields.get('listingDate')?.value, '2026-08-01');
  assert.equal(fields.get('contractDate')?.value, '2026-08-15');
  assert.equal(fields.get('projectedCloseDate')?.value, '2026-09-10');
  assert.equal(fields.get('listingExpirationDate')?.value, '2026-12-01');
  assert.equal(fields.get('closeDate')?.value, '2026-09-08');
  assert.equal(fields.get('listPrice')?.value, 410000);
  assert.equal(fields.get('salePrice')?.value, 400000);
  assert.equal(fields.get('commissionPercent')?.value, 3);
  assert.equal(fields.get('grossGci')?.value, 12000);
  assert.equal(fields.get('transactionFee')?.value, 395);
  assert.equal(fields.get('brokerPercent')?.value, 30);
  assert.equal(fields.get('brokerGci')?.value, 3600);
  assert.match(String(fields.get('referral')?.value), /Outbound — Referral Partner \(25%\)/);
  assert.equal(fields.get('agentPercent')?.value, 70);
  assert.equal(fields.get('agentNet')?.value, 8400);
  assert.equal(fields.get('agentTakeHome')?.value, 8400);
  assert.equal(fields.get('transactionFeePayer')?.value, 'Buyer pays directly');
  assert.match(String(fields.get('transactionFeePayer')?.detail), /Does not reduce agent take-home pay/);
  assert.equal(fields.get('bonuses')?.value, 3000);
  assert.equal(fields.get('totalAgentPayout')?.value, 11400);
});

test('optional accounting details do not block closeout while mandated closed-file values retain missing-state checks', () => {
  const snapshot = buildAccountingSnapshot({
    propertyAddress: '123 Example Street',
    agentDisplayName: 'Primary Agent',
    closedDate: '2026-09-08',
    salePrice: 400000,
    gci: 12000,
    transactionFee: 395,
    brokerGci: 3600,
    agentDollar: 8400,
    isInHouse: true,
    closingType: 'listing',
  }, 'accounting-test-002');
  const fields = new Map(snapshot.fields.map((field) => [field.id, field]));

  assert.equal(fields.get('clientNames')?.required, false);
  assert.equal(fields.get('leadSource')?.required, false);
  assert.equal(fields.get('commissionPercent')?.required, false);
  assert.equal(fields.get('referral')?.required, false);
  assert.equal(fields.get('clientNames')?.state, 'missing');
  assert.deepEqual(requiredAccountingFieldsMissing(snapshot), []);
});

test('Accounting uses the saved team-member percentage when the independent-agent split is absent', () => {
  const fields = fieldMap({
    status: 'closed',
    splitSnapshot: {
      memberPercentOfLeaderSide: 75,
      agentSplitPercent: null,
    },
  });

  assert.equal(fields.get('agentPercent')?.value, 75);
});

test('Accounting derives display-only payout percentages when a legacy team snapshot stores dollars but no percentages', () => {
  const fields = fieldMap({
    status: 'closed',
    gci: 600,
    agentPct: 0,
    brokerPct: 0,
    splitSnapshot: {
      grossCommission: 600,
      agentNetCommission: 450,
      companyRetained: 150,
      agentSplitPercent: null,
      companySplitPercent: null,
      memberPercentOfLeaderSide: null,
    },
  });

  assert.equal(fields.get('agentPercent')?.value, 75);
  assert.equal(fields.get('brokerPercent')?.value, 25);
});

test('Accounting shows an agent-paid transaction fee as a take-home deduction', () => {
  const fields = fieldMap({
    status: 'closed',
    txComplianceFee: 'yes',
    txComplianceFeeAmount: 395,
    txComplianceFeePaidBy: 'agent',
    agentDollar: 5400,
    splitSnapshot: { agentNetCommission: 5400 },
  });

  assert.equal(fields.get('transactionFeePayer')?.value, 'Agent(s) pay from commission');
  assert.match(String(fields.get('transactionFee')?.detail), /Deducted from the responsible agent/);
  assert.equal(fields.get('agentNet')?.value, 5400);
  assert.equal(fields.get('agentTakeHome')?.value, 5005);
});

test('Accounting preserves a co-agent primary payout already reduced by its saved fee allocation', () => {
  const fields = fieldMap({
    status: 'closed',
    txComplianceFee: 'yes',
    txComplianceFeeAmount: 395,
    txComplianceFeePaidBy: 'agent',
    txComplianceFeePrimaryAgentAmount: 197.5,
    agentDollar: 5202.5,
    coAgent: { agentId: 'co-agent-001' },
    participantAllocations: {
      primary: { netCommission: 5202.5, transactionFeeDeduction: 197.5 },
    },
    splitSnapshot: { agentNetCommission: 5202.5 },
  });

  assert.equal(fields.get('agentNet')?.value, 5202.5);
  assert.equal(fields.get('agentTakeHome')?.value, 5202.5);
});

test('Accounting labels seller closing-cost fees without deducting the agent take-home', () => {
  const fields = fieldMap({
    status: 'closed',
    txComplianceFee: 'yes',
    txComplianceFeeAmount: 395,
    txComplianceFeePaidBy: 'seller_closing_cost',
    agentDollar: 5400,
    splitSnapshot: { agentNetCommission: 5400 },
  });

  assert.equal(fields.get('transactionFeePayer')?.value, 'Seller-paid closing cost');
  assert.match(String(fields.get('transactionFeePayer')?.detail), /does not reduce agent take-home pay/);
  assert.equal(fields.get('agentTakeHome')?.value, 5400);
});
