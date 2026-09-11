import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');
const teamResolver = read('src/app/api/transactions/_lib/teamTransactionResolver.ts');
const takeHome = read('src/lib/transactions/agentTakeHome.ts');
const adminTransactionsRoute = read('src/app/api/admin/transactions/route.ts');

test('normal TC approval uses the canonical team resolver even when the form carries calculated split fields', () => {
  assert.match(
    tcRoute,
    /if \(intake\.commissionOverride && \(rawAgentDollar !== null \|\| intake\.agentPct != null\)\)/,
    'Only an explicit commission override may preserve a manual split.',
  );
  assert.doesNotMatch(
    tcRoute,
    /else if \(rawAgentDollar !== null && rawAgentDollar > 0\)/,
    'Ordinary calculated agent-dollar form values must not bypass team resolution.',
  );
  assert.match(
    tcRoute,
    /All other approvals resolve the canonical profile,[\s\S]*?leader-team structure at the deal date\./,
  );
  assert.match(
    tcRoute,
    /calc = await resolveTransactionCalculation\(\{[\s\S]*?transactionDate: txDate/,
    'The live path must resolve the profile and membership as of the transaction date.',
  );
});

test('leader-team calculation persists member, leader, and brokerage allocations rather than a generic 70/30 split', () => {
  assert.match(teamResolver, /calculationModel: 'teamMember'/);
  assert.match(teamResolver, /memberPercentOfLeaderSide/);
  assert.match(teamResolver, /const leaderRetainedAfterMember = asMoney\(leaderStructureGross - memberPaid\)/);
  assert.match(teamResolver, /companyRetained = asMoney\(commission \* \(Number\(leaderBand\.companyPercent \|\| 0\) \/ 100\)\)/);
});

test('an explicitly agent-paid transaction fee remains a separate Agent Take Home deduction', () => {
  assert.match(takeHome, /payer === 'agent'/);
  assert.match(takeHome, /return roundMoney\(Math\.max\(0, grossSplit - fee\)\)/);
  assert.doesNotMatch(takeHome, /leaderRetainedAfterMember/);
});

test('a controlled team-snapshot correction can persist leader credit and refresh the affected leader rollup', () => {
  assert.match(adminTransactionsRoute, /'splitSnapshot', 'creditSnapshot', 'agentType', 'calculationModel', 'brokerProfit'/);
  assert.match(adminTransactionsRoute, /const previousLeaderId = String\(existingData\?\.creditSnapshot\?\.progressionLeaderAgentId \|\| ''\)\.trim\(\)/);
  assert.match(adminTransactionsRoute, /const currentLeaderId = String\(txData\?\.creditSnapshot\?\.progressionLeaderAgentId \|\| ''\)\.trim\(\)/);
  assert.match(adminTransactionsRoute, /for \(const leaderId of leaderIds\)[\s\S]*?await rebuildAgentRollup\(adminDb, leaderId, txYear\)/);
});
