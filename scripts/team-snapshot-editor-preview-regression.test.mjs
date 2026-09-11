import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('../src/app/dashboard/transactions/new/page.tsx', import.meta.url);
const source = await readFile(pagePath, 'utf8');

test('saved team snapshots are authoritative when reopening a closed team file', () => {
  assert.match(source, /const hasSavedTeamSnapshot = tx\.calculationModel === 'teamMember'/);
  assert.match(source, /setSavedTeamSnapshotPreview\(savedSplitSnapshot\)/);
  assert.match(source, /tierName: 'Saved team allocation'/);
  assert.match(source, /memberPercentOfLeaderSide: memberPercent/);
  assert.match(source, /leaderStructurePercent: leaderPercent/);
});

test('the commission banner distinguishes saved three-way allocations from live tier previews', () => {
  assert.match(source, /<strong>Saved team allocation<\/strong>/);
  assert.match(source, /Agent \{activeTier\.agentSplitPercent\}% \/ Leader \{activeTier\.leaderStructurePercent! - activeTier\.agentSplitPercent\}% \/ Broker \{activeTier\.companySplitPercent\}%/);
  assert.match(source, /<strong>Auto-calculated<\/strong> using tier/);
});

test('deliberate recalculation and direct split edits clear the saved snapshot preview', () => {
  const clearCount = (source.match(/setSavedTeamSnapshotPreview\(null\)/g) || []).length;
  assert.ok(clearCount >= 5, `expected saved preview reset for reload, recalculation, and manual edits; found ${clearCount}`);
  assert.match(source, /profileRecalculationRequested\.current = true;[\s\S]{0,300}setSavedTeamSnapshotPreview\(null\)/);
  assert.match(source, /const setManualDollarSplit[\s\S]{0,450}setSavedTeamSnapshotPreview\(null\)/);
});
