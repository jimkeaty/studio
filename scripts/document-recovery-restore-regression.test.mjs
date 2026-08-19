import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'src/app/api/admin/diagnostics/document-recovery/restore/route.ts'), 'utf8');

test('document recovery restoration is admin-only, owner-scoped, append-only, and never deletes storage files', () => {
  assert.match(source, /isAdminLike/);
  assert.match(source, /transactions\/documents\/\$\{uploaderUid\}\//);
  assert.match(source, /Approved storage paths must belong to the transaction owner/);
  assert.match(source, /mergeDocuments/);
  assert.match(source, /documentsRecoveredAt/);
  assert.doesNotMatch(source, /\.delete\(/);
});

