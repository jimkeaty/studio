import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const callerUid = decoded.uid;

    // Only admin/staff can reset another agent's plan
    const callerDoc = await adminDb.collection('agentProfiles').doc(callerUid).get();
    const callerRole = callerDoc.data()?.role;
    const isAdmin = callerRole === 'admin' || callerRole === 'staff';

    const body = await req.json();
    const { agentId, note } = body as { agentId?: string; note?: string };

    // Determine target UID
    let targetUid: string;
    if (agentId && isAdmin) {
      targetUid = agentId;
    } else if (!agentId) {
      // Agent resetting their own plan
      targetUid = callerUid;
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Load the agent's current plan ────────────────────────────────────────
    const year = new Date().getFullYear();
    const planRef = adminDb
      .collection('dashboards').doc(String(year))
      .collection('agent').doc(targetUid)
      .collection('plans').doc('plan');

    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return NextResponse.json({ error: 'No business plan found for this agent.' }, { status: 404 });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // ── Reset: keep all goals, just update the start date ───────────────────
    await planRef.update({
      resetStartDate: todayStr,
      resetAt: today.toISOString(),
      resetBy: callerUid,
      resetNote: note || null,
      updatedAt: today.toISOString(),
    });

    // ── Notify the agent ─────────────────────────────────────────────────────
    const callerName = callerDoc.data()?.displayName || 'Your Director';
    const notifBody = note
      ? `${callerName} reset your business plan to start from today. Note: "${note}"`
      : `${callerName} reset your business plan to start from today. Your goals remain the same — the clock restarts now!`;

    await sendNotification(adminDb, {
      type: 'system',
      recipientUids: [targetUid],
      title: '📋 Business Plan Reset',
      body: notifBody,
      url: '/dashboard/plan',
    });

    return NextResponse.json({ success: true, resetStartDate: todayStr });
  } catch (err: any) {
    console.error('[plan/reset] error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
