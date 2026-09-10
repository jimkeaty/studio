import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR_TIME_QR_DEDUPLICATION_MINUTES, hasRecentFloorTimeQrCheckIn } from '../src/lib/attendance/rules';

test('Floor Time QR deduplication blocks only matching active-agent scans inside the documented 15-minute window', () => {
  const now = new Date('2026-09-10T15:00:00.000Z');
  const record = { agentId: 'agent-1', type: 'floor_time', source: 'floor_time_qr', qrCodeId: 'current-code', checkInAt: '2026-09-10T14:46:00.000Z' };
  assert.equal(FLOOR_TIME_QR_DEDUPLICATION_MINUTES, 15);
  assert.equal(hasRecentFloorTimeQrCheckIn([record], 'agent-1', 'current-code', now), true);
  assert.equal(hasRecentFloorTimeQrCheckIn([{ ...record, checkInAt: '2026-09-10T14:45:00.000Z' }], 'agent-1', 'current-code', now), false);
  assert.equal(hasRecentFloorTimeQrCheckIn([record], 'agent-2', 'current-code', now), false);
  assert.equal(hasRecentFloorTimeQrCheckIn([record], 'agent-1', 'rotated-code', now), false);
  assert.equal(hasRecentFloorTimeQrCheckIn([{ ...record, source: 'secure_office_checkin' }], 'agent-1', 'current-code', now), false);
});
