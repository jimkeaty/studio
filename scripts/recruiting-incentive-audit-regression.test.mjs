import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const engine = read('src/lib/recruiting/incentiveEngine.ts');
const org = read('src/lib/recruiting/org.ts');
const agentRoute = read('src/app/api/recruiting/route.ts');
const admin = read('src/lib/recruiting/adminIncentives.ts');
const adminRoute = read('src/app/api/admin/recruiting-incentives/route.ts');
const paymentRoute = read('src/app/api/admin/recruiting-incentives/payments/route.ts');
const profileRoute = read('src/app/api/admin/agent-profiles/[agentId]/route.ts');
const profileForm = read('src/components/admin/agents/AgentProfileForm.tsx');
const management = read('src/components/dashboard/broker/RecruitingIncentiveManagement.tsx');
const tracker = read('src/components/dashboard/agent/RecruitingIncentiveTracker.tsx');
const configRoute = read('src/app/api/admin/recruiting-config/route.ts');

test('incentive progress uses canonical closed transaction commission data rather than recruiter-maintained totals', () => {
  assert.match(engine, /resolveGCI/);
  assert.match(engine, /transaction\.status === 'closed'/);
  assert.match(engine, /recruitingDate\(transaction\.closedDate\)/);
  assert.match(engine, /splitSnapshot\?\.grossCommission/);
  assert.doesNotMatch(engine, /manualProduction|recruiterProductionTotal/);
});
test('missing or zero production goals cannot falsely qualify a recruit', () => {
  assert.match(engine, /Number\.isFinite\(threshold\) && threshold > 0/);
  assert.match(configRoute, /gciThreshold must be greater than zero/);
  assert.match(admin, /!hireDate \|\| !config\.enabled \|\| config\.gciThreshold <= 0 \? 'not_started'/);
});
test('admin referral assignment is explicit, auditable, removable, and protected against self-referral and loops', () => {
  assert.match(profileForm, /Referred By:/);
  assert.match(profileForm, /No Referring Agent/);
  assert.match(profileRoute, /referralHistory/);
  for (const event of ['assigned', 'corrected', 'removed']) assert.match(profileRoute, new RegExp(event));
  assert.match(profileRoute, /different agent/);
  assert.match(profileRoute, /relationship loop/);
  assert.match(profileRoute, /batch\.create\(historyRef/);
});
test('first- and configured second-level relationships calculate from the canonical referring-agent chain', () => {
  assert.match(agentRoute, /referringAgentId/);
  assert.match(agentRoute, /config\.tierDepth >= 2/);
  assert.match(admin, /relationship: 'direct'/);
  assert.match(admin, /relationship: 'second_level'/);
  assert.match(admin, /config\.tierDepth === 2/);
});
test('management displays required qualification fields and creates immutable paid history only from earned windows', () => {
  for (const field of ['recruitName', 'referralDate', 'windowStart', 'closedGci', 'requiredGoal', 'progressPercent', 'potentialIncentive', 'qualificationDate', 'paymentStatus']) assert.match(admin, new RegExp(field));
  for (const status of ['not_started', 'in_progress', 'earned', 'paid', 'expired']) assert.match(admin, new RegExp(status));
  assert.match(admin, /row\.status !== 'earned'/);
  assert.match(admin, /paymentRef\.create/);
  assert.match(admin, /recruitingIncentiveAudit/);
  assert.match(management, /Potential Recruiting Incentives/);
  assert.match(management, /Qualified \/ Owed/);
  assert.match(management, /Paid YTD/);
  assert.match(management, /Mark Paid/);
  assert.match(adminRoute, /requireIncentiveAdmin/);
  assert.match(paymentRoute, /markIncentivePaid/);
});
test('agent-facing tracker distinguishes progress, earned, paid, dates, and potential incentives without exposing payout administration', () => {
  for (const term of ['Recruit / Qualification Period', 'Potential / Earned', 'Earned — Payment Pending', 'Paid', 'Not Started']) assert.match(tracker, new RegExp(term));
  assert.doesNotMatch(tracker, /Mark Paid/);
});
test('recruiting incentive configuration resolves tenant context while preserving Keaty as the legacy fallback', () => {
  assert.match(org, /organizationId \|\| claims\?\.orgId \|\| claims\?\.tenantId/);
  assert.match(org, /: 'keaty'/);
  assert.match(agentRoute, /resolveRecruitingOrgId/);
  assert.match(configRoute, /resolveRecruitingOrgId/);
});
