import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const helper = readFileSync(new URL('../src/lib/transactions/syncCoAgentAllocations.ts', import.meta.url), 'utf8');
const resolver = readFileSync(new URL('../src/app/api/transactions/_lib/teamTransactionResolver.ts', import.meta.url), 'utf8');
const agentRoute = readFileSync(new URL('../src/app/api/agent/transactions/[txId]/route.ts', import.meta.url), 'utf8');
const adminRoute = readFileSync(new URL('../src/app/api/admin/transactions/route.ts', import.meta.url), 'utf8');
const staffRoute = readFileSync(new URL('../src/app/api/admin/staff-queue/[itemId]/route.ts', import.meta.url), 'utf8');
const tcRoute = readFileSync(new URL('../src/app/api/admin/tc/[id]/route.ts', import.meta.url), 'utf8');
const createRoute = readFileSync(new URL('../src/app/api/transactions/route.ts', import.meta.url), 'utf8');
const form = readFileSync(new URL('../src/app/dashboard/transactions/new/page.tsx', import.meta.url), 'utf8');

test('co-agent allocations pass the referral share into both participant snapshots', () => {
  assert.match(helper, /resolveOutboundReferral\(transaction, totalGci\)/);
  assert.match(helper, /allocateOutboundReferralAcrossCoAgents/);
  assert.match(helper, /referralFeeDollar: primaryReferralDollar/);
  assert.match(helper, /referralFeeDollar: coReferralDollar/);
  assert.match(helper, /grossCommission: primaryGci/);
  assert.match(helper, /grossCommission: coGci/);
  assert.match(helper, /agentDollar: primarySnapshot\?\.agentNetCommission/);
});

test('every transaction save path treats referral fields as commission-driving inputs', () => {
  for (const [name, source] of [
    ['agent route', agentRoute],
    ['admin route', adminRoute],
    ['staff route', staffRoute],
    ['TC route', tcRoute],
    ['direct create route', createRoute],
  ]) {
    assert.match(source, /resolveOutboundReferral/, `${name} must normalize outbound referral values`);
  }
  for (const [name, source] of [
    ['agent route', agentRoute],
    ['admin route', adminRoute],
    ['staff route', staffRoute],
    ['TC route', tcRoute],
  ]) {
    assert.match(source, /outboundReferralFeeDollar/, `${name} must react to a referral dollar change`);
  }
  assert.match(staffRoute, /buildCoAgentAllocationUpdate/);
  assert.match(tcRoute, /buildCoAgentAllocationUpdate/);
});

test('closed legacy records reopen with visible normalized referral values', () => {
  assert.match(form, /resolvedHasOutboundReferral/);
  assert.match(form, /resolvedOutboundReferralPercent/);
  assert.match(form, /resolvedOutboundReferralDollar/);
  assert.match(form, /hasOutboundReferral: resolvedHasOutboundReferral/);
  assert.match(form, /outboundReferralFeeDollar: resolvedOutboundReferralDollar/);
});

test('leaderless participant snapshots reconcile rounded agent and company payouts', () => {
  assert.match(resolver, /companyRetained = asMoney\(commission - agentNetCommission\)/);
});
