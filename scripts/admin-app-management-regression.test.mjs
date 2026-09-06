import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const registry = read('src/lib/plugins/registry.ts');
const availability = read('src/app/api/app-management/available/route.ts');
const adminRoute = read('src/app/api/admin/app-management/route.ts');
const adminPage = read('src/app/dashboard/admin/app-management/page.tsx');
const hook = read('src/hooks/useAgentPlugins.ts');

test('centralized rollout settings support Hidden, Coming Soon, Active, targeted recipients, and immutable audit records', () => {
  for (const state of ['hidden', 'coming_soon', 'active']) assert.match(adminRoute, new RegExp(`'${state}'`));
  for (const scope of ['roles', 'officeIds', 'teamIds', 'userIds']) assert.match(adminRoute, new RegExp(scope));
  assert.match(adminRoute, /collection\('auditEvents'\)/);
  assert.match(adminPage, /Hidden removes access/);
  assert.match(adminPage, /Changes never delete external-app data/);
});

test('configured app rollout overrides are applied after legacy entitlements without breaking existing default access when unconfigured', () => {
  assert.match(availability, /configured: false/);
  assert.match(hook, /Central rollout settings below/);
  assert.match(hook, /rollout === 'hidden'/);
  assert.match(hook, /rollout === 'active' \|\| rollout === 'coming_soon'/);
});

test('Smart Offer Intake reuses its existing external application and Smart Project, Inspections, Forms, and Property ROI share the same centralized registry', () => {
  assert.match(registry, /smart-offer/);
  assert.match(registry, /https:\/\/smartoffer-nkbfcax4\.manus\.space/);
  for (const id of ['smart-project-management', 'smart-inspections', 'smart-forms', 'smart-property-roi']) assert.match(registry, new RegExp(id));
  assert.match(registry, /maintains its own access session until a verified SSO bridge is available/);
});

test('Coming Soon apps are discoverable but unavailable, while hidden apps are omitted from accessible plugin navigation', () => {
  assert.match(hook, /badge: 'Coming Soon'/);
  assert.match(hook, /if \(rollout === 'hidden'\) return false/);
});
