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

test('automatic transaction contact saves deduplicate a client and never erase saved details with blank aliases', () => {
  assert.match(transactionForm, /const clientsByName = new Map/);
  assert.match(transactionForm, /A listing can carry the same person in the legacy clientName field/);
  assert.match(transactionForm, /email: String\(current\.email \|\| email\)/);
  assert.match(transactionForm, /phone: String\(current\.phone \|\| phone\)/);
  assert.match(contactsRoute, /Automatic transaction upserts are additive/);
  assert.match(contactsRoute, /\['name', 'email', 'phone', 'newAddress', 'companyName'/);
  assert.match(contactsRoute, /if \(!clean\(contact\[field\]\) && clean\(existingContact\[field\]\)\)/);
});

test('a blank same-owner contact duplicate is hidden when a complete record exists without deleting either record', () => {
  assert.match(contactsRoute, /Keep both documents intact for[\s\S]*audit\/recovery/);
  assert.match(contactsRoute, /const isBlankIndividual = contact\.recordKind !== 'company'/);
  assert.match(contactsRoute, /candidate\.createdBy === contact\.createdBy/);
  assert.match(contactsRoute, /candidate\.type === contact\.type/);
  assert.match(contactsRoute, /clean\(candidate\.email\) \|\| clean\(candidate\.phone\) \|\| clean\(candidate\.newAddress\)/);
});
