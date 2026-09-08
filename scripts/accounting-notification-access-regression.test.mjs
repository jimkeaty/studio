import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const preferencesPage = read('src/app/dashboard/settings/notifications/page.tsx');
const preferencesApi = read('src/app/api/notifications/preferences/route.ts');
const dispatcher = read('src/lib/notifications/sendNotification.ts');
const recipients = read('src/lib/notifications/getRecipientUids.ts');
const accountingRoute = read('src/app/api/admin/accounting-closeout/route.ts');
const staffQueue = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');
const adminTransactions = read('src/app/api/admin/transactions/route.ts');
const agentTransactions = read('src/app/api/agent/transactions/[txId]/route.ts');
const staffUsers = read('src/app/api/admin/staff-users/route.ts');
const staffUserUpdate = read('src/app/api/admin/staff-users/[userId]/route.ts');
const staffUsersPage = read('src/app/dashboard/admin/staff-users/page.tsx');
const operationalFields = read('src/lib/transactions/operationalEditFields.ts');
const staffAccess = read('src/lib/auth/staffAccess.ts');
const staffHook = read('src/hooks/useIsStaff.ts');
const adminHook = read('src/hooks/useIsAdminLike.ts');
const onboarding = read('src/app/api/onboarding/route.ts');
const tcQueuePage = read('src/app/dashboard/admin/tc/page.tsx');
const sidebar = read('src/components/dashboard/sidebar-nav.tsx');
const staffSelfLink = read('src/app/api/admin/staff-self-link/route.ts');

test('Accounting users can control each closeout event through standard notification preferences', () => {
  for (const event of [
    'accounting_closeout_new',
    'accounting_closeout_attention',
    'accounting_closeout_completed',
  ]) {
    assert.match(preferencesPage, new RegExp(`'${event}'`));
    assert.match(dispatcher, new RegExp(`'${event}'`));
  }
  assert.match(preferencesPage, /label: 'Accounting Closeout'/);
  assert.match(preferencesPage, /disabled=\{!prefs\[ch\.key\] \|\| \(ch\.key === 'sms' && !phone\)\}/);
  assert.match(preferencesApi, /notificationPrefs: normalisedPrefs/);
  assert.doesNotMatch(preferencesApi, /valid.*event|allowed.*event/i);
});

test('closeout notification routing respects active staff records and user-level contact priority', () => {
  assert.match(recipients, /\['accounting', 'office_admin'\]/);
  assert.match(recipients, /String\(data\.status \|\| 'active'\)\.toLowerCase\(\) === 'inactive'/);
  assert.match(dispatcher, /if \(!resolvedEmail \|\| !resolvedName \|\| !resolvedPhone\)/);
  assert.match(dispatcher, /resolvedPhone = resolvedPhone \|\| String\(sd\.phone \|\| ''\)\.trim\(\)/);
  assert.match(dispatcher, /if \(channels\.sms && smsPhone\)/);
  assert.match(staffQueue, /type: 'accounting_closeout_new'/);
});

test('Accounting attention and completion notifications use saved recipient preferences after workflow state is written', () => {
  assert.match(accountingRoute, /workflowRecipientUids/);
  assert.match(accountingRoute, /type: 'accounting_closeout_attention'/);
  assert.match(accountingRoute, /type: 'accounting_closeout_completed'/);
  assert.match(accountingRoute, /await txRef\.set\(/);
  assert.match(accountingRoute, /if \(notification && notification\.recipientUids\.length > 0\)/);
  assert.match(accountingRoute, /await sendNotification\(adminDb, \{/);
});

test('Staff, TC, and Admin retain the full authorized editor while agents remain blocked after closure', () => {
  for (const route of [staffQueue, tcRoute, adminTransactions]) {
    assert.match(route, /OPERATIONAL_TRANSACTION_FORM_FIELDS/);
    assert.match(route, /hasTransactionVersionConflict/);
  }
  assert.match(operationalFields, /commercialLeaseCommissionFlat/);
  assert.match(operationalFields, /showingCallOrder1Name/);
  assert.match(operationalFields, /agentBonusPassThrough/);
  assert.match(staffQueue, /mergeOperationalDirectSplit/);
  assert.match(tcRoute, /mergeOperationalDirectSplit/);
  assert.match(agentTransactions, /Closed transactions cannot be edited by agents/);
  assert.match(agentTransactions, /txData\.status === 'closed'/);
});

test('Admin can assign Accounting and Staff roles with linked notification profiles', () => {
  for (const source of [staffUsers, staffUserUpdate]) {
    assert.match(source, /'staff'/);
    assert.match(source, /'accounting'/);
  }
  assert.match(staffUsers, /notificationPrefs/);
  assert.match(staffUsers, /phone: phone\?\.trim\(\) \|\| null/);
  assert.match(staffUsersPage, /staff: 'Staff'/);
  assert.match(staffUsersPage, /accounting: 'Accounting'/);
});

test('the Accounting role has the approved Admin, TC, and Accounting operational access without broadening agent permissions', () => {
  assert.match(staffAccess, /return role === 'office_admin' \|\| role === 'tc_admin' \|\| role === 'accounting'/);
  assert.match(staffAccess, /return role === 'office_admin' \|\| role === 'accounting'/);
  assert.match(staffAccess, /!allSnap\.empty && !allSnap\.docs\[0\]\.data\(\)\.status/);
  assert.match(adminHook, /full-access 'accounting'/);
  assert.match(staffHook, /staffRole === 'office_admin' \|\| staffRole === 'tc_admin' \|\| staffRole === 'accounting'/);
  assert.match(staffUsers, /isAdminLike\(decoded\.uid\)/);
  assert.match(staffUserUpdate, /isAdminLike\(decoded\.uid\)/);
  assert.match(staffUsersPage, /Full Admin, TC, and Accounting workflow access/);
  assert.match(onboarding, /role === 'office_admin' \|\| role === 'tc_admin' \|\| role === 'accounting'/);
  assert.match(tcQueuePage, /u\.role === 'tc' \|\| u\.role === 'tc_admin' \|\| u\.role === 'accounting'/);
  assert.match(sidebar, /const \{ isAdmin: showAdminMenu \} = useIsAdminLike\(\)/);
  assert.match(agentTransactions, /Closed transactions cannot be edited by agents/);
});

test('inactive staff records cannot regain Accounting or Admin-equivalent access through legacy self-link fallbacks', () => {
  assert.match(staffSelfLink, /if \(!linkedData\.status\)/);
  assert.match(staffSelfLink, /!d\.data\(\)\.status && \(d\.data\(\)\.email \|\| ''\)\.toLowerCase\(\) === email\.toLowerCase\(\)/);
});
