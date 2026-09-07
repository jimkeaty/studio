import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const picker = read('src/components/transactions/SignLocationPicker.tsx');
const form = read('src/app/dashboard/transactions/new/page.tsx');
const agent = read('src/app/api/agent/transactions/[txId]/route.ts');
const admin = read('src/app/api/admin/transactions/route.ts');
const staff = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tc = read('src/app/api/admin/tc/[id]/route.ts');
const intake = read('src/app/api/tc/route.ts');

test('sign placement supports an optional typed address, nearby-place search, manual map placement, movable pin, exact coordinates, and dedicated notes', () => {
  assert.match(picker, /nominatim\.openstreetmap\.org\/search/);
  assert.match(picker, /map\.on\('click'/);
  assert.match(picker, /draggable: true/);
  assert.match(picker, /loadLeaflet/);
  assert.match(picker, /basemaps\.cartocdn\.com/);
  assert.doesNotMatch(picker, /await import\('leaflet'\)/);
  assert.doesNotMatch(picker, /tile\.openstreetmap\.org/);
  for (const field of ['address', 'latitude', 'longitude', 'notes']) assert.match(picker, new RegExp(field));
  assert.match(picker, /Address is optional when exact coordinates are sufficient/);
  assert.match(picker, /Place sign near west entrance beside utility pole/);
});

test('coordinates generate a direct installer navigation link while preserving a separately typed placement address', () => {
  assert.match(picker, /google\.com\/maps\/dir/);
  assert.match(picker, /Open Sign Location/);
  assert.match(picker, /onChange\(\{ address: query, latitude/);
});

test('the canonical unified form hydrates, displays, and submits persistent sign placement values without replacing prior sign-order instructions', () => {
  for (const field of ['signPlacementAddress', 'signPlacementLatitude', 'signPlacementLongitude', 'signPlacementNotes']) {
    assert.match(form, new RegExp(`${field}: z\\.string`));
    assert.match(form, new RegExp(`${field}: tx\\.${field}`));
    assert.match(form, new RegExp(`form\\.setValue\\('${field}'`));
  }
  assert.match(form, /signSpecialRequests/);
  assert.match(form, /SignLocationPicker/);
});

test('agent, Admin, Staff, TC, and new intake paths retain sign placement data across save, refresh, login, and reopen', () => {
  for (const source of [agent, admin, staff, tc]) {
    for (const field of ['signPlacementAddress', 'signPlacementLatitude', 'signPlacementLongitude', 'signPlacementNotes']) assert.match(source, new RegExp(field));
  }
  assert.match(intake, /signPlacementLatitude: toStr\(body\.signPlacementLatitude\)/);
  assert.match(intake, /signPlacementLongitude: toStr\(body\.signPlacementLongitude\)/);
});
