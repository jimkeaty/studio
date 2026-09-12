import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const resolver = readFileSync(resolve(root, 'src/app/api/transactions/_lib/teamTransactionResolver.ts'), 'utf8');

test('leader-team tier selection uses progression before the current close', () => {
  assert.match(
    resolver,
    /getActiveLeaderBand\(teamPlan!\.leaderStructureBands \|\| \[\], leaderYtd\)/,
  );
  assert.match(
    resolver,
    /getActiveMemberBand\(\s*memberPlan\.payoutBands \|\| \[\],\s*memberYtd,\s*\)/,
  );
  assert.match(
    resolver,
    /getActiveMemberBand\(\s*sourceSpecificOverrideBands,\s*memberYtd,\s*\)/,
  );
  assert.match(resolver, /selectSourceSpecificMemberBands\(/);
  assert.doesNotMatch(resolver, /leaderProgressionAfterTransaction/);
  assert.doesNotMatch(resolver, /memberProgressionAfterTransaction/);
});

test('leader retained is always the leader-side spread after the member payout', () => {
  assert.match(
    resolver,
    /const leaderRetainedAfterMember = asMoney\(leaderStructureGross - memberPaid\)/,
  );
});
