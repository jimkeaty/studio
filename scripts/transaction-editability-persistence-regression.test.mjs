import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const form = read('src/app/dashboard/transactions/new/page.tsx');
const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const adminRoute = read('src/app/api/admin/transactions/route.ts');
const staffRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');

test('agents may edit their own applicable transaction terms until closure while operational users retain closed-file correction authority', () => {
  assert.match(form, /if \(isClosedAgentView\)/);
  assert.match(form, /Agents cannot edit closed transactions/);
  assert.match(agentRoute, /Closed transactions cannot be edited by agents/);
  assert.match(adminRoute, /verifyAdmin/);
  assert.match(staffRoute, /isStaff/);
  assert.match(tcRoute, /isStaff/);
});

test('all supported financial terms use established authoritative recalculation and rollup paths without coupling pass-through bonuses or cooperating offers to GCI', () => {
  for (const route of [adminRoute, staffRoute, tcRoute]) {
    assert.match(route, /commissionCalculationMethod/);
    assert.match(route, /commissionFlatAmount/);
  }
  assert.match(adminRoute, /updates\.gci = flatAmount/);
  assert.match(adminRoute, /updates\.commission = flatAmount/);
  assert.match(adminRoute, /grossCommission: flatAmount/);
  assert.match(agentRoute, /commissionPercent/);
  assert.match(agentRoute, /splitSnapshot/);
  assert.match(adminRoute, /rebuildAgentRollup/);
  assert.match(staffRoute, /rebuildAgentRollup/);
  assert.match(tcRoute, /rebuildAgentRollup/);
  assert.match(form, /cooperating-agent offer is a separate payment term/);
  assert.match(form, /agentBonus/);
});

test('edit success and failure UI only confirms persistence after the API confirms it and preserves form values for retry', () => {
  assert.match(form, /if \(!res\.ok\) \{/);
  assert.match(form, /title: res\.status === 409 \? 'Transaction changed — refresh required' : 'Save failed'/);
  assert.match(form, /setLastSavedAt\(new Date\(\)\)/);
  assert.match(form, /Saved successfully · Last saved/);
  assert.match(form, /lastSaveSucceededRef\.current = true/);
  assert.match(form, /catch \(err: any\) \{\n\s*toast\(\{ title: 'Error saving'/);
});

test('new transaction confirmation also waits for a successful server response before clearing its recovery draft', () => {
  assert.match(form, /if \(!res\.ok \|\| !data\.ok\) throw new Error/);
  const createBranch = form.slice(form.indexOf('// ── Normal add mode'));
  const successBeforeDraftClear = createBranch.indexOf('if (!res.ok || !data.ok) throw new Error') < createBranch.indexOf('localStorage.removeItem(DRAFT_KEY)');
  assert.equal(successBeforeDraftClear, true);
});
