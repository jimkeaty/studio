// POST /api/admin/staff-self-link
//
// Called on every login for any authenticated user.
// If the caller's email matches a staffUsers record that has firebaseUid=null,
// this endpoint links their Firebase UID to that record so the role lookup works.
//
// This is needed when staff users are created manually (before they sign in),
// or when they sign in via Google (which creates a new Firebase UID not yet linked).
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const h = req.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (!token) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const { uid, email } = decoded;
    if (!email) return NextResponse.json({ ok: false, error: 'No email on token' }, { status: 400 });

    // Check if this UID is already linked
    const alreadyLinked = await adminDb
      .collection('staffUsers')
      .where('firebaseUid', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (!alreadyLinked.empty) {
      // Already linked — return the role
      return NextResponse.json({ ok: true, linked: false, role: alreadyLinked.docs[0].data().role });
    }

    // Look for a staffUsers record matching this email with no UID linked yet
    const byEmail = await adminDb
      .collection('staffUsers')
      .where('email', '==', email.toLowerCase())
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (byEmail.empty) {
      // Not a staff user — normal agent login, no action needed
      return NextResponse.json({ ok: true, linked: false, role: null });
    }

    const doc = byEmail.docs[0];
    const data = doc.data();

    // Only link if firebaseUid is not yet set (or is null/empty)
    if (data.firebaseUid && data.firebaseUid !== uid) {
      // Already linked to a different UID — don't overwrite
      return NextResponse.json({ ok: true, linked: false, role: data.role });
    }

    // Link this Firebase UID to the staff record
    await doc.ref.update({
      firebaseUid: uid,
      updatedAt: new Date(),
    });

    return NextResponse.json({ ok: true, linked: true, role: data.role });
  } catch (err: any) {
    console.error('[POST /api/admin/staff-self-link]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal error' }, { status: 500 });
  }
}
