import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  optionalSelect,
  optionalStringArray,
} from '../src/lib/transactions/optionalFormValues';

test('blank optional warranty selections are accepted as unselected values', () => {
  const value = optionalSelect(['yes', 'no'] as const).safeParse('');
  assert.equal(value.success, true);
  if (value.success) assert.equal(value.data, undefined);
});

test('legacy boolean ShowingTime notification values are accepted as unselected values', () => {
  const value = optionalStringArray.safeParse(false);
  assert.equal(value.success, true);
  if (value.success) assert.equal(value.data, undefined);
});

test('valid ShowingTime notification choices remain intact', () => {
  const value = optionalStringArray.safeParse(['Text', 'Email']);
  assert.equal(value.success, true);
  if (value.success) assert.deepEqual(value.data, ['Text', 'Email']);
});

test('the unified transaction form uses the behavior-tested optional field helpers', () => {
  const source = readFileSync('src/app/dashboard/transactions/new/page.tsx', 'utf8');
  assert.match(source, /optionalStringArray/);
  assert.match(source, /sellerWarrantyEducationRequested:\s*optionalYesNo/);
  assert.match(source, /showingCallOrder2Notify:\s*optionalStringArray/);
});
