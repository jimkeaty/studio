import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeListingMediaFolderUrl } from '../src/lib/transactions/listingMediaFolder';

test('listing media folders accept normalized HTTPS sharing links and allow a blank field', () => {
  assert.equal(normalizeListingMediaFolderUrl(' https://drive.google.com/drive/folders/example '), 'https://drive.google.com/drive/folders/example');
  assert.equal(normalizeListingMediaFolderUrl('https://www.dropbox.com/sh/example?dl=0'), 'https://www.dropbox.com/sh/example?dl=0');
  assert.equal(normalizeListingMediaFolderUrl(''), null);
  assert.equal(normalizeListingMediaFolderUrl(null), null);
});

test('listing media folders reject unsafe or incomplete links before they can become clickable', () => {
  assert.equal(normalizeListingMediaFolderUrl('javascript:alert(1)'), null);
  assert.equal(normalizeListingMediaFolderUrl('http://example.com/folder'), null);
  assert.equal(normalizeListingMediaFolderUrl('drive.google.com/folder/example'), null);
});
