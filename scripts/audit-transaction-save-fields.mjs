import fs from 'node:fs';

const form = fs.readFileSync('src/app/dashboard/transactions/new/page.tsx', 'utf8');
const route = fs.readFileSync('src/app/api/admin/transactions/route.ts', 'utf8');

const fieldMapStart = form.indexOf('const fieldMap: Record<string, unknown> = {');
const fieldMapEnd = form.indexOf('};', fieldMapStart);
if (fieldMapStart < 0 || fieldMapEnd < 0) throw new Error('Could not locate edit field map');

const formFields = [...form.slice(fieldMapStart, fieldMapEnd).matchAll(/^\s{10}([A-Za-z0-9_]+):/gm)]
  .map((m) => m[1]);

const whitelistStart = route.indexOf('const UPDATABLE_FIELDS = new Set([');
const whitelistEnd = route.indexOf(']);', whitelistStart);
if (whitelistStart < 0 || whitelistEnd < 0) throw new Error('Could not locate transaction whitelist');

const allowed = new Set(
  [...route.slice(whitelistStart, whitelistEnd).matchAll(/'([^']+)'/g)].map((m) => m[1])
);

const intentionalReadOnly = new Set([
  'agentId', 'agentDisplayName', 'splitSnapshot', 'creditSnapshot', 'agentType',
  'calculationModel', 'year', 'createdAt', 'updatedAt',
]);
const missing = formFields.filter((field) => !allowed.has(field) && !intentionalReadOnly.has(field));

console.log(JSON.stringify({
  formFieldCount: formFields.length,
  allowedFieldCount: allowed.size,
  missingFromAuthoritativeSaveWhitelist: [...new Set(missing)].sort(),
}, null, 2));
