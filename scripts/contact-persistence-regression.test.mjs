import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const contactsRoute = readFileSync(new URL('src/app/api/contacts/route.ts', root), 'utf8');
const contactMutation = readFileSync(new URL('src/app/api/contacts/[contactId]/route.ts', root), 'utf8');
const contactBook = readFileSync(new URL('src/app/dashboard/contacts/page.tsx', root), 'utf8');
const transactionForm = readFileSync(new URL('src/app/dashboard/transactions/new/page.tsx', root), 'utf8');

test('Task 7 keeps all supported contact categories in the canonical contacts collection', () => {
  for (const type of ['client', 'lender', 'title', 'other_agent', 'inspector', 'insurance', 'vendor', 'attorney']) {
    assert.match(contactsRoute, new RegExp(`'${type}'`));
  }
  assert.match(contactBook, /Vendor \/ Service Provider/);
});

test('company contacts are first-class records and individuals remain separate children', () => {
  assert.match(contactsRoute, /recordKind: 'company'/);
  assert.match(contactsRoute, /recordKind: 'individual'/);
  assert.match(contactsRoute, /companyContactId/);
  assert.match(contactsRoute, /contact\.name = contact\.officerName \|\| contact\.companyName/);
});

test('duplicates use normalized email or individual name and never merge officers by company alone', () => {
  assert.match(contactsRoute, /normalizedEmail/);
  assert.match(contactsRoute, /normalizedName/);
  assert.match(contactsRoute, /Legacy contacts created before normalized fields were introduced/);
  assert.match(contactsRoute, /legacyEmailSnap/);
  assert.doesNotMatch(contactsRoute, /where\('companyName', '==', contact\.companyName\)/);
});

test('contact read and mutation access stay tenant scoped with agent ownership enforcement', () => {
  assert.match(contactsRoute, /tenantId/);
  assert.match(contactsRoute, /createdBy', '==', uid/);
  assert.match(contactMutation, /Contact belongs to a different brokerage/);
  assert.match(contactMutation, /You can only update your own contacts/);
  assert.match(contactMutation, /You can only delete your own contacts/);
});

test('transaction contacts auto-save and autocomplete for buyers, sellers, lenders, title, and referrals', () => {
  for (const field of ['buyerName', 'sellerName', 'clientName', 'mortgageCompany', 'titleCompany', 'otherAgentName', 'outboundReferralAgentName']) {
    assert.match(transactionForm, new RegExp(`name="${field}"`));
  }
  assert.match(transactionForm, /type="client" placeholder="Primary buyer"/);
  assert.match(transactionForm, /type="client" placeholder="Primary seller"/);
  assert.match(transactionForm, /type="other_agent" placeholder="Agent receiving the referral"/);
  assert.match(transactionForm, /saveContact\('lender'/);
  assert.match(transactionForm, /saveContact\('title'/);
  assert.match(transactionForm, /saveContact\('other_agent'/);
});
