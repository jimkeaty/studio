import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isClosedStaffQueueReview,
  requestedAccountingRelease,
  shouldReleaseToAccounting,
} from '../src/lib/transactions/staffAccountingRelease';

test('recognizes current and legacy closed-file Staff Queue wrappers', () => {
  assert.equal(isClosedStaffQueueReview({ newStatus: 'closed' }), true);
  assert.equal(isClosedStaffQueueReview({ listingStatus: ' CLOSED ' }), true);
  assert.equal(isClosedStaffQueueReview({ actionType: 'closed_buyer' }), true);
  assert.equal(isClosedStaffQueueReview({ actionType: 'closed_tc_approval' }), true);
  assert.equal(isClosedStaffQueueReview({ newStatus: 'pending', actionType: 'status_change' }), false);
});

test('explicit release handles a Staff reviewer closing an older queue item', () => {
  const input = {
    action: 'approve',
    releaseToAccounting: true,
    canonicalStatus: 'closed',
    queueItem: { newStatus: 'active', actionType: 'status_change' },
  };

  assert.equal(requestedAccountingRelease(input), true);
  assert.equal(shouldReleaseToAccounting(input), true);
});

test('a release request cannot bypass the canonical Closed requirement', () => {
  assert.equal(shouldReleaseToAccounting({
    action: 'approve',
    releaseToAccounting: true,
    canonicalStatus: 'pending',
    queueItem: { newStatus: 'closed' },
  }), false);
});

test('ordinary non-closed Staff approvals do not create Accounting closeouts', () => {
  assert.equal(shouldReleaseToAccounting({
    action: 'approve',
    canonicalStatus: 'closed',
    queueItem: { newStatus: 'active', actionType: 'status_change' },
  }), false);
  assert.equal(shouldReleaseToAccounting({
    action: 'save',
    releaseToAccounting: true,
    canonicalStatus: 'closed',
    queueItem: { newStatus: 'closed' },
  }), false);
});
