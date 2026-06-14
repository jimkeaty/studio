/**
 * POST /api/agent/open-house-submissions
 * Agent submits an open house for the weekly email blast.
 * Creates a record in `openHouseSubmissions` and adds an item to `staffQueue`.
 *
 * GET /api/agent/open-house-submissions
 * Returns the current agent's own submissions.
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

// Fetch staff UIDs to notify
async function getStaffUids(): Promise<string[]> {
  const snap = await adminDb.collection('users')
    .where('role', 'in', ['staff', 'admin', 'broker'])
    .get();
  return snap.docs.map(d => d.id);
}

export async function GET(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }

  // Find agent profile
  const profileSnap = await adminDb.collection('agentProfiles')
    .where('firebaseUid', '==', decoded.uid).limit(1).get();
  const agentId = profileSnap.empty ? decoded.uid : profileSnap.docs[0].id;

  const snap = await adminDb.collection('openHouseSubmissions')
    .where('agentId', '==', agentId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }

  const body = await req.json();
  const {
    openHouseDate,   // ISO date string e.g. "2025-06-21"
    startTime,       // e.g. "1:00 PM"
    endTime,         // e.g. "4:00 PM"
    agentName,
    agentPhone,
    propertyAddress, // pulled from their listing or typed
    mlsNumber,       // optional
    specialNotes,    // e.g. "Giveaway!", "Lunch provided"
  } = body;

  if (!openHouseDate || !startTime || !endTime || !agentName) {
    return jsonErr(400, 'openHouseDate, startTime, endTime, and agentName are required');
  }

  // Find agent profile
  const profileSnap = await adminDb.collection('agentProfiles')
    .where('firebaseUid', '==', decoded.uid).limit(1).get();
  const agentId = profileSnap.empty ? decoded.uid : profileSnap.docs[0].id;
  const agentDisplayName = profileSnap.empty ? agentName : (profileSnap.docs[0].data().displayName || agentName);

  const now = new Date().toISOString();
  const submission: Record<string, any> = {
    agentId,
    agentUid: decoded.uid,
    agentName: agentDisplayName,
    agentPhone: agentPhone || null,
    propertyAddress: propertyAddress || null,
    mlsNumber: mlsNumber || null,
    openHouseDate,
    startTime,
    endTime,
    specialNotes: specialNotes || null,
    status: 'pending',          // pending | email_sent | cancelled
    emailSentAt: null,
    emailSentBy: null,
    staffNotes: null,
    createdAt: now,
    updatedAt: now,
    weekOf: getWeekOf(openHouseDate),
  };

  const docRef = await adminDb.collection('openHouseSubmissions').add(submission);

  // Add to staff queue as open_house type
  const staffQueueItem: Record<string, any> = {
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
  };
  await adminDb.collection('staffQueue').add(staffQueueItem);

  // Notify staff
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

function getWeekOf(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}
