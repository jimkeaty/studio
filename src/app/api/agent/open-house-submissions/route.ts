/**
 * GET    /api/agent/open-house-submissions        — agent's own submissions
 * POST   /api/agent/open-house-submissions        — submit a new open house
 * PATCH  /api/agent/open-house-submissions?id=X   — edit time/notes (with late-change flag)
 * DELETE /api/agent/open-house-submissions?id=X   — cancel with reason
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function getStaffUids(): Promise<string[]> {
  const snap = await adminDb.collection('users')
    .where('role', 'in', ['staff', 'admin', 'broker'])
    .get();
  return snap.docs.map(d => d.id);
}

/** Resolve both the agentId (profile doc ID) and agentUid (Firebase UID) for a caller */
async function resolveAgent(uid: string): Promise<{ agentId: string; agentUid: string; displayName: string }> {
  const byFbUid = await adminDb.collection('agentProfiles')
    .where('firebaseUid', '==', uid).limit(1).get();
  if (!byFbUid.empty) {
    const d = byFbUid.docs[0].data();
    return { agentId: byFbUid.docs[0].id, agentUid: uid, displayName: d.displayName || d.name || '' };
  }
  const direct = await adminDb.collection('agentProfiles').doc(uid).get();
  if (direct.exists) {
    const d = direct.data() || {};
    return { agentId: uid, agentUid: d.firebaseUid || uid, displayName: d.displayName || d.name || '' };
  }
  return { agentId: uid, agentUid: uid, displayName: '' };
}

/** Returns true if the current time is past Thursday noon (submission deadline) */
function isPastDeadline(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 4=Thu
  const hour = now.getHours();
  return (day === 4 && hour >= 12) || day === 5 || day === 6 || day === 0;
}

function getWeekOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }

  const { agentId, agentUid } = await resolveAgent(decoded.uid);

  // Query by both agentId (profile slug) and agentUid (Firebase UID) to handle both
  // storage patterns. Merge and deduplicate results in memory (avoids composite index).
  const [byAgentId, byAgentUid, byRawUid] = await Promise.all([
    adminDb.collection('openHouseSubmissions').where('agentId', '==', agentId).limit(100).get(),
    agentUid !== agentId
      ? adminDb.collection('openHouseSubmissions').where('agentUid', '==', agentUid).limit(100).get()
      : Promise.resolve(null),
    decoded.uid !== agentId && decoded.uid !== agentUid
      ? adminDb.collection('openHouseSubmissions').where('agentUid', '==', decoded.uid).limit(100).get()
      : Promise.resolve(null),
  ]);

  const seen = new Set<string>();
  const items: any[] = [];
  for (const snap of [byAgentId, byAgentUid, byRawUid]) {
    if (!snap) continue;
    for (const doc of snap.docs) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        items.push({ id: doc.id, ...doc.data() });
      }
    }
  }

  items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return NextResponse.json({ ok: true, items: items.slice(0, 50) });
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }

  const body = await req.json();
  const { openHouseDate, startTime, endTime, agentName, agentPhone, propertyAddress, mlsNumber, specialNotes } = body;

  if (!openHouseDate || !startTime || !endTime || !agentName) {
    return jsonErr(400, 'openHouseDate, startTime, endTime, and agentName are required');
  }

  const { agentId, agentUid, displayName } = await resolveAgent(decoded.uid);
  const agentDisplayName = displayName || agentName;
  const now = new Date().toISOString();

  const submission: Record<string, any> = {
    agentId,
    agentUid,
    agentName: agentDisplayName,
    agentPhone: agentPhone || null,
    propertyAddress: propertyAddress || null,
    mlsNumber: mlsNumber || null,
    openHouseDate,
    startTime,
    endTime,
    specialNotes: specialNotes || null,
    status: 'pending',
    checklist: { mls: false, boomtown: false, email: false },
    emailSentAt: null,
    emailSentBy: null,
    staffNotes: null,
    cancelReason: null,
    changeHistory: [],
    createdAt: now,
    updatedAt: now,
    weekOf: getWeekOf(openHouseDate),
  };

  const docRef = await adminDb.collection('openHouseSubmissions').add(submission);

  await adminDb.collection('staffQueue').add({
    actionType: 'open_house',
    submissionId: docRef.id,
    agentId,
    agentName: agentDisplayName,
    submittedBy: decoded.uid,
    submittedByName: agentDisplayName,
    address: propertyAddress || null,
    openHouseDate,
    startTime,
    endTime,
    specialNotes: specialNotes || null,
    status: 'pending_review',
    reviewedBy: null,
    reviewedAt: null,
    staffNotes: null,
    createdAt: now,
    updatedAt: now,
  });

  const staffUids = await getStaffUids();
  if (staffUids.length > 0) {
    await sendNotification(adminDb, {
      type: 'staff_queue_new',
      recipientUids: staffUids,
      title: '🏠 New Open House Submission',
      body: `${agentDisplayName} submitted an open house for ${openHouseDate} (${startTime}–${endTime})${propertyAddress ? ' at ' + propertyAddress : ''}.`,
      url: '/dashboard/admin/staff-queue',
    });
  }

  return NextResponse.json({ ok: true, id: docRef.id });
}

// ─── PATCH (edit time / notes) ────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonErr(400, 'id is required');

  const ref = adminDb.collection('openHouseSubmissions').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonErr(404, 'Submission not found');
  const data = snap.data()!;

  const { agentId, agentUid } = await resolveAgent(decoded.uid);
  if (data.agentId !== agentId && data.agentUid !== agentUid && data.agentUid !== decoded.uid) {
    return jsonErr(403, 'You do not own this submission');
  }
  if (data.status === 'cancelled') return jsonErr(400, 'Cannot edit a cancelled submission');

  const body = await req.json();
  const { startTime, endTime, openHouseDate, propertyAddress, mlsNumber, specialNotes } = body;

  const lateChange = isPastDeadline();
  const now = new Date().toISOString();

  const historyEntry: Record<string, any> = {
    changedAt: now,
    changedBy: decoded.uid,
    lateChange,
    previous: {
      startTime: data.startTime,
      endTime: data.endTime,
      openHouseDate: data.openHouseDate,
      propertyAddress: data.propertyAddress,
      specialNotes: data.specialNotes,
    },
  };

  const updates: Record<string, any> = {
    updatedAt: now,
    changeHistory: [...(data.changeHistory || []), historyEntry],
  };
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime !== undefined) updates.endTime = endTime;
  if (openHouseDate !== undefined) { updates.openHouseDate = openHouseDate; updates.weekOf = getWeekOf(openHouseDate); }
  if (propertyAddress !== undefined) updates.propertyAddress = propertyAddress;
  if (mlsNumber !== undefined) updates.mlsNumber = mlsNumber;
  if (specialNotes !== undefined) updates.specialNotes = specialNotes;

  if (data.status === 'email_sent') {
    updates.status = 'pending';
    updates.emailSentAt = null;
    updates.emailSentBy = null;
    updates.checklist = { mls: false, boomtown: false, email: false };
  }

  await ref.update(updates);

  const sqSnap = await adminDb.collection('staffQueue').where('submissionId', '==', id).limit(1).get();
  if (!sqSnap.empty) {
    await sqSnap.docs[0].ref.update({
      startTime: updates.startTime ?? data.startTime,
      endTime: updates.endTime ?? data.endTime,
      openHouseDate: updates.openHouseDate ?? data.openHouseDate,
      address: updates.propertyAddress ?? data.propertyAddress,
      specialNotes: updates.specialNotes ?? data.specialNotes,
      status: 'pending_review',
      updatedAt: now,
    });
  }

  const staffUids = await getStaffUids();
  const agentDisplayName = data.agentName || 'An agent';
  const newDate = updates.openHouseDate ?? data.openHouseDate;
  const newStart = updates.startTime ?? data.startTime;
  const newEnd = updates.endTime ?? data.endTime;
  const addr = updates.propertyAddress ?? data.propertyAddress;

  if (staffUids.length > 0) {
    await sendNotification(adminDb, {
      type: 'staff_queue_new',
      recipientUids: staffUids,
      title: lateChange ? '⚠️ Late Open House Change' : '✏️ Open House Updated',
      body: lateChange
        ? `${agentDisplayName} changed their open house AFTER the Thursday noon deadline. New time: ${newDate} ${newStart}–${newEnd}${addr ? ' at ' + addr : ''}. The email blast may have already been sent — please update MLS/Boomtown if needed.`
        : `${agentDisplayName} updated their open house to ${newDate} (${newStart}–${newEnd})${addr ? ' at ' + addr : ''}.`,
      url: '/dashboard/admin/staff-queue',
    });
  }

  return NextResponse.json({ ok: true, lateChange });
}

// ─── DELETE (cancel with reason) ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonErr(400, 'id is required');

  const ref = adminDb.collection('openHouseSubmissions').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonErr(404, 'Submission not found');
  const data = snap.data()!;

  const { agentId, agentUid } = await resolveAgent(decoded.uid);
  if (data.agentId !== agentId && data.agentUid !== agentUid && data.agentUid !== decoded.uid) {
    return jsonErr(403, 'You do not own this submission');
  }

  const body = await req.json().catch(() => ({}));
  const cancelReason = body.cancelReason || null;
  const lateChange = isPastDeadline();
  const now = new Date().toISOString();

  await ref.update({ status: 'cancelled', cancelReason, updatedAt: now });

  const sqSnap = await adminDb.collection('staffQueue').where('submissionId', '==', id).limit(1).get();
  if (!sqSnap.empty) {
    await sqSnap.docs[0].ref.update({
      status: 'completed',
      staffNotes: `Cancelled by agent${cancelReason ? ': ' + cancelReason : ''}`,
      reviewedAt: now,
      updatedAt: now,
    });
  }

  const staffUids = await getStaffUids();
  const agentDisplayName = data.agentName || 'An agent';
  if (staffUids.length > 0) {
    await sendNotification(adminDb, {
      type: 'staff_queue_new',
      recipientUids: staffUids,
      title: lateChange ? '⚠️ Late Open House Cancellation' : '❌ Open House Cancelled',
      body: lateChange
        ? `${agentDisplayName} CANCELLED their open house on ${data.openHouseDate}${data.propertyAddress ? ' at ' + data.propertyAddress : ''} AFTER the Thursday noon deadline. The email blast may have already been sent — please update MLS/Boomtown accordingly.${cancelReason ? ' Reason: ' + cancelReason : ''}`
        : `${agentDisplayName} cancelled their open house on ${data.openHouseDate}${data.propertyAddress ? ' at ' + data.propertyAddress : ''}.${cancelReason ? ' Reason: ' + cancelReason : ''}`,
      url: '/dashboard/admin/staff-queue',
    });
  }

  return NextResponse.json({ ok: true, lateChange });
}
