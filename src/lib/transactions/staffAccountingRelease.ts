export type StaffQueueCloseReview = {
  newStatus?: unknown;
  listingStatus?: unknown;
  actionType?: unknown;
};

const CLOSED_REVIEW_ACTION_TYPES = new Set([
  'closed_buyer',
  'closed_tc_approval',
]);

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Recognizes both current and historical Staff Queue representations of a
 * closed-file review. Queue wrappers are workflow indexes, so this is never
 * the sole authority for release; the linked canonical transaction must also
 * still be Closed.
 */
export function isClosedStaffQueueReview(item: StaffQueueCloseReview) {
  return normalized(item.newStatus) === 'closed'
    || normalized(item.listingStatus) === 'closed'
    || CLOSED_REVIEW_ACTION_TYPES.has(normalized(item.actionType));
}

/**
 * A Staff user may release a file only with an approval-style action and only
 * while its canonical transaction remains Closed. The explicit flag is sent by
 * the UI button labelled "Approve & Send to Accounting". The queue fallback
 * preserves behavior for existing closed-review items and historic callers.
 */
export function shouldReleaseToAccounting(input: {
  action: unknown;
  releaseToAccounting?: unknown;
  canonicalStatus: unknown;
  queueItem: StaffQueueCloseReview;
}) {
  const approvalAction = normalized(input.action) === 'approve'
    || normalized(input.action) === 'complete';
  if (!approvalAction || normalized(input.canonicalStatus) !== 'closed') return false;

  return input.releaseToAccounting === true || isClosedStaffQueueReview(input.queueItem);
}

export function requestedAccountingRelease(input: {
  releaseToAccounting?: unknown;
  queueItem: StaffQueueCloseReview;
}) {
  return input.releaseToAccounting === true || isClosedStaffQueueReview(input.queueItem);
}
