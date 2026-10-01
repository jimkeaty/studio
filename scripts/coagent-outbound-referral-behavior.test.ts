import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateOutboundReferralAcrossCoAgents,
  resolveOutboundReferral,
} from '../src/lib/transactions/outboundReferral';

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

test('a normalized outbound referral is deducted from total GCI before co-agent payouts', () => {
  const referral = resolveOutboundReferral({
    hasOutboundReferral: true,
    outboundReferralFeePercent: 25,
    outboundReferralFeeDollar: 4875,
  }, 19500);
  const allocation = allocateOutboundReferralAcrossCoAgents(referral.referralFeeDollar, 50);

  assert.deepEqual(referral, {
    active: true,
    referralFeePercent: 25,
    referralFeeDollar: 4875,
    netAfterReferral: 14625,
  });
  assert.deepEqual(allocation, {
    primaryReferralFeeDollar: 2437.5,
    coAgentReferralFeeDollar: 2437.5,
  });

  const participantGross = 19500 * 0.5;
  const participantNetAfterReferral = participantGross - allocation.primaryReferralFeeDollar;
  const agentNet = money(participantNetAfterReferral * 0.75);
  const companyRetained = money(participantNetAfterReferral - agentNet);

  assert.equal(participantGross, 9750);
  assert.equal(participantNetAfterReferral, 7312.5);
  assert.equal(agentNet, 5484.38);
  assert.equal(companyRetained, 1828.12);
  assert.equal(money(agentNet + companyRetained), participantNetAfterReferral);
});

test('legacy nested referral fields hydrate safely while an explicit false flag stays false until corrected', () => {
  const legacyWithoutToggle = resolveOutboundReferral({
    outboundReferralFee: { referralPercent: 25, referralDollar: 4875 },
  }, 19500);
  assert.equal(legacyWithoutToggle.active, true);
  assert.equal(legacyWithoutToggle.referralFeeDollar, 4875);

  const explicitlyDisabled = resolveOutboundReferral({
    hasOutboundReferral: false,
    outboundReferralFeePercent: 25,
    outboundReferralFeeDollar: { referralPercent: 25 },
  }, 19500);
  assert.deepEqual(explicitlyDisabled, {
    active: false,
    referralFeePercent: null,
    referralFeeDollar: null,
    netAfterReferral: 19500,
  });
});

test('exact-dollar referral allocation assigns the rounding remainder without drift', () => {
  const allocation = allocateOutboundReferralAcrossCoAgents(1000, 33.3333);
  assert.equal(money(allocation.primaryReferralFeeDollar + allocation.coAgentReferralFeeDollar), 1000);
  assert.equal(allocation.primaryReferralFeeDollar, 333.33);
  assert.equal(allocation.coAgentReferralFeeDollar, 666.67);
});
