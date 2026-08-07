// POST /api/admin/bulk-enable-tv-notifications
// Admin-only: sets tvNotificationPrefs to { in_app: true, email: true, sms: true }
// for all four TV board post types on every active agentProfiles doc.
// Agents can override their own preferences at any time via My Preferences.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const ALL_ON = {
  buyerNeeds:    { in_app: true, email: true, sms: true },
  comingSoon:    { in_app: true, email: true, sms: true },
  openHouseOpps: { in_app: true, email: true, sms: true },
  agentHelp:     { in_app: true, email: true, sms: true },
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Admin only');

    // Fetch all active agent profiles
    const snap = await adminDb.collection('agentProfiles')
      .where('status', '==', 'active')
      .get();

    let updated = 0;
    let skipped = 0;
    const batch = adminDb.batch();

    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.email) { skipped++; continue; }
      batch.set(doc.ref, { tvNotificationPrefs: ALL_ON }, { merge: true });
      updated++;
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      message: `Set all TV board notifications (in-app, email, SMS) for ${updated} active agents. ${skipped} skipped (no email).`,
    });
  } catch (err: any) {
    console.error('[bulk-enable-tv-notifications]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
