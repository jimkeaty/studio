import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSourceSpecificMemberBands } from '../src/lib/commissions/sourceSpecificMemberBands';

const madelynBands = [
  { fromCompanyDollar: 0, toCompanyDollar: null, memberPercent: 80, notes: 'Sphere of influence lead' },
  { fromCompanyDollar: 0, toCompanyDollar: null, memberPercent: 60, notes: 'Company generated lead' },
];

test('selects the CGL sphere override instead of the first overlapping custom band', () => {
  const bands = selectSourceSpecificMemberBands(madelynBands, 'sphere');
  assert.equal(bands.length, 1);
  assert.equal(bands[0].memberPercent, 80);
});

test('selects the CGL company-generated override instead of the sphere override', () => {
  const bands = selectSourceSpecificMemberBands(madelynBands, 'company gen');
  assert.equal(bands.length, 1);
  assert.equal(bands[0].memberPercent, 60);
});

test('does not silently apply a source-tagged exception when the source is absent or unrelated', () => {
  assert.deepEqual(selectSourceSpecificMemberBands(madelynBands, null), []);
  assert.deepEqual(selectSourceSpecificMemberBands(madelynBands, 'referral'), []);
});

test('retains legacy behavior for custom bands that have no source-specific tags', () => {
  const legacyBands = [{ fromCompanyDollar: 0, toCompanyDollar: null, memberPercent: 55 }];
  assert.deepEqual(selectSourceSpecificMemberBands(legacyBands, 'sphere'), legacyBands);
});
