import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const versionHelper = read('src/lib/transactions/transactionVersion.ts');
const adminRoute = read('src/app/api/admin/transactions/route.ts');
const staffQueueRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');
const transactionForm = read('src/app/dashboard/transactions/new/page.tsx');
const adminLedger = read('src/app/dashboard/admin/transactions/page.tsx');
const transactionCreateRoute = read('src/app/api/tc/route.ts');
const operationalFields = read('src/lib/transactions/operationalEditFields.ts');
const commissionProfileRoute = read('src/app/api/admin/agent-profiles/[agentId]/commission/route.ts');
const teamResolver = read('src/app/api/transactions/_lib/teamTransactionResolver.ts');
const charlesDitchTeam = read('src/lib/teams/charlesDitchTeam.ts');

test('Task 9: canonical transaction version helper recognizes supplied stale saves', () => {
  assert.match(versionHelper, /hasTransactionVersionConflict/);
  assert.match(versionHelper, /normalizeTransactionVersion/);
  assert.match(versionHelper, /if \(!expected\) return false/);
});

test('Task 9: Admin, Staff, and TC save routes reject a stale transaction version', () => {
  for (const [name, source] of [
    ['admin transaction route', adminRoute],
    ['staff queue route', staffQueueRoute],
    ['TC route', tcRoute],
  ]) {
    assert.match(source, /hasTransactionVersionConflict/, `${name} must compare the canonical version`);
    assert.match(source, /jsonError\(409, 'This transaction was changed by another authorized user/, `${name} must return an explicit conflict`);
    assert.match(source, /lastUpdateTime:/, `${name} must use a Firestore write precondition`);
    assert.doesNotMatch(
      source,
      /\.update\([\s\S]{0,240}\? \{ lastUpdateTime: [\s\S]{0,80}: undefined/,
      `${name} must not pass an undefined precondition into Firestore update`,
    );
  }
});

test('Task 9: version-safe transaction updates use a two-argument Firestore call when no precondition is supplied', () => {
  for (const [name, source] of [
    ['admin transaction route', adminRoute],
    ['staff queue route', staffQueueRoute],
    ['TC route', tcRoute],
  ]) {
    assert.match(source, /else \{\s*(?:await )?\w+\.update\(\w+\);/, `${name} must omit the absent precondition`);
  }
});

test('Task 9: the unified edit form persists its loaded version and shows a refresh-required conflict', () => {
  assert.match(transactionForm, /transactionVersionRef/);
  assert.match(transactionForm, /expectedUpdatedAt: transactionVersionRef\.current/);
  assert.match(transactionForm, /Transaction changed — refresh required/);
  assert.match(transactionForm, /transactionVersionRef\.current = normalizeTransactionVersion\(data\.transaction\?\.updatedAt\)/);
});

test('Task 9: direct Admin Ledger transfer and quick-status saves include the loaded version', () => {
  assert.match(adminLedger, /expectedUpdatedAt: \(transferTx as any\)\.updatedAt/);
  assert.match(adminLedger, /expectedUpdatedAt: \(quickStatusTx as any\)\.updatedAt/);
});

test('pass-through selections persist through Admin, Staff, TC, and new-transaction save paths without profile splits overwriting the approved 100-percent agent payout', () => {
  assert.match(operationalFields, /'isPassThrough'/);
  for (const [name, source] of [
    ['admin transaction route', adminRoute],
    ['staff queue route', staffQueueRoute],
    ['TC route', tcRoute],
    ['new transaction route', transactionCreateRoute],
  ]) {
    assert.match(source, /enforcePassThroughFinancialPolicy/, `${name} must enforce canonical pass-through economics`);
  }
  assert.match(staffQueueRoute, /const isPassThrough = isPassThroughTransaction\(\{ \.\.\.currentTx, \.\.\.allowed \}\)/);
  assert.match(tcRoute, /const isPassThrough = isPassThroughTransaction\(\{ \.\.\.currentTxForUpdate, \.\.\.txSyncUpdate \}\)/);
  assert.match(transactionForm, /if \(isPassThroughTransaction\) \{[\s\S]*?gci: resolvedGci,[\s\S]*?agentPct: 100,[\s\S]*?agentDollar: Number\(resolvedAgentDollar\) > 0 \? resolvedAgentDollar : resolvedGci/);
});

test('leader-team members use the team plan and preserve a member, leader, and brokerage snapshot on operational save', () => {
  assert.match(commissionProfileRoute, /const isMemberOnLeaderTeam =/);
  assert.match(commissionProfileRoute, /if \(agentStoredTiers\.length > 0 && !isMemberOnLeaderTeam\)/);
  assert.match(commissionProfileRoute, /const matchingLeaderBand = teamIsWithLeader/);
  assert.match(commissionProfileRoute, /companyPct = teamIsWithLeader/);
  assert.match(commissionProfileRoute, /leaderStructurePercent: Number\(matchingLeaderBand\.leaderPercent \|\| 0\)/);
  assert.match(adminRoute, /hasCommissionCalculationChange/);
  assert.match(adminRoute, /\(hasSplitChange \|\| hasCommissionCalculationChange\) && !isPassThrough && !hasManualCommissionOverride/);
  assert.match(adminRoute, /if \(teamCalculation\.splitSnapshot\)/);
  assert.match(adminRoute, /updates\.agentDollar = teamSplit\.memberPaid \?\? teamSplit\.agentNetCommission/);
  assert.match(adminRoute, /updates\.brokerGci = teamSplit\.companyRetained/);
  assert.match(teamResolver, /const leaderRetainedAfterMember = asMoney\(leaderStructureGross - memberPaid\)/);
});

test('Charles Ditch Team preserves the approved 70-percent member, 5-percent leader, and 25-percent brokerage Tier 1 allocation', () => {
  assert.match(
    charlesDitchTeam,
    /\{ fromCompanyDollar: 0, toCompanyDollar: 42000, leaderPercent: 75, companyPercent: 25 \}/,
  );
  assert.match(
    charlesDitchTeam,
    /\{ fromCompanyDollar: 42000, toCompanyDollar: 84000, memberPercent: 70 \}/,
  );
  assert.match(
    commissionProfileRoute,
    /leaderStructurePercent: Number\(matchingLeaderBand\.leaderPercent \|\| 0\)/,
  );
  assert.match(
    commissionProfileRoute,
    /companyPct = teamIsWithLeader\s*\? Number\(matchingLeaderBand\?\.companyPercent \?\? companyPctForMember\)/,
  );
});

test('leader-team members ignore stale generic profile tiers and use their linked member plan for Tier 2 payout', () => {
  assert.match(
    commissionProfileRoute,
    /collection\('teamMemberships'\)[\s\S]*?where\('agentId', '==', agentId\)[\s\S]*?activeFlag === true/,
    'Commission preview must resolve active membership even when legacy profile metadata is incomplete',
  );
  assert.match(
    commissionProfileRoute,
    /teamMemberCompMode === 'custom'[\s\S]*?sourceSpecificOverrideBands\.length > 0/,
    'Only an explicit custom team-member mode with a matching canonical lead source may use override bands',
  );
  assert.match(
    commissionProfileRoute,
    /let tiers: ReturnType<typeof normalizeTier>\[\] = isMemberOnLeaderTeam \? \[\] : agentStoredTiers/,
    'Leader-team members must not start from stale generic profile tiers',
  );
  assert.match(
    commissionProfileRoute,
    /teamMemberships[\s\S]*?\$\{primaryTeamId\}__\$\{agentId\}__member[\s\S]*?memberPlans/,
    'Commission preview must resolve the member plan linked to active membership',
  );
  assert.match(
    charlesDitchTeam,
    /fromCompanyDollar: 42000, toCompanyDollar: 84000, memberPercent: 70/,
    'Scott Tier 2 member plan remains 70% of full GCI',
  );
  assert.match(
    charlesDitchTeam,
    /fromCompanyDollar: 42000, toCompanyDollar: 84000, leaderPercent: 75, companyPercent: 25/,
    'Charles Tier 2 leader plan remains 75% leader side and 25% brokerage',
  );
});
