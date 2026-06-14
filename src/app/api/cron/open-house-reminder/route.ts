/**
 * POST /api/cron/open-house-reminder
 * 
 * Two modes (pass ?mode=deadline or ?mode=staff_deadline):
 *
 * mode=deadline (Thursday 9 AM):
 *   Sends SMS + email to ALL agents reminding them to submit open houses by noon Thursday.
 *
 * mode=staff_deadline (Friday 9 AM):
 *   Sends in-app + email to ALL staff reminding them the open house email blast is due by noon Friday.
 *
 * Secured by CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'deadline';

  if (mode === 'deadline') {
    // Thursday 9 AM — remind all agents to submit open houses by noon
    const agentSnap = await adminDb.collection('agentProfiles')
      .where('status', '==', 'active')
      .get();

    const agentUids: string[] = [];
    for (const doc of agentSnap.docs) {
      const data = doc.data();
      if (data.isDemoAccount) continue;
      const uid = data.firebaseUid || data.uid;
      if (uid) agentUids.push(uid);
    }

    if (agentUids.length > 0) {
      // Send in batches of 50 to avoid overwhelming the notification system
      const batchSize = 50;
      for (let i = 0; i < agentUids.length; i += batchSize) {
        const batch = agentUids.slice(i, i + batchSize);
        await sendNotification(adminDb, {
          type: 'system',
          recipientUids: batch,
          title: '🏠 Open House Deadline: Today at Noon',
          body: 'Submit your open house by noon today to be included in this week\'s email blast to all agents, clients, and leads. Log in to Smart Broker → Dashboard → Submit Open House.',
          url: '/dashboard',
        });
      }
    }

    return NextResponse.json({ ok: true, mode, agentsNotified: agentUids.length });
  }

  if (mode === 'staff_deadline') {
    // Friday 9 AM — remind staff the email blast is due by noon
    const staffSnap = await adminDb.collection('users')
      .where('role', 'in', ['staff', 'admin', 'broker'])
      .get();

    const staffUids = staffSnap.docs.map(d => d.id);

    // Count pending open house submissions for this week
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    const weekOf = monday.toISOString().split('T')[0];

    const submissionsSnap = await adminDb.collection('openHouseSubmissions')
      .where('weekOf', '==', weekOf)
      .where('status', '==', 'pending')
      .get();

    const pendingCount = submissionsSnap.size;

    if (staffUids.length > 0) {
      await sendNotification(adminDb, {
        type: 'staff_queue_new',
        recipientUids: staffUids,
        title: `📧 Open House Email Due by Noon Today`,
        body: `There ${pendingCount === 1 ? 'is 1 open house submission' : `are ${pendingCount} open house submissions`} waiting for this week's email blast. Please send the email by noon today and mark each submission as "Email Sent" in the Staff Queue.`,
        url: '/dashboard/admin/staff-queue',
      });
    }

    return NextResponse.json({ ok: true, mode, staffNotified: staffUids.length, pendingSubmissions: pendingCount });
  }

  return NextResponse.json({ ok: false, error: 'Unknown mode' }, { status: 400 });
}
