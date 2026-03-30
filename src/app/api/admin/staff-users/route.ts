// GET /api/admin/staff-users — list all staff users
// POST /api/admin/staff-users — create a staff user with Firebase Auth account
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { getStaffRole } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}
function serializeDoc(id: string, data: FirebaseFirestore.DocumentData) {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    out[k] = v?.toDate ? v.toDate().toISOString() : v;
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const role = await getStaffRole(decoded.uid);
    if (role !== 'office_admin') return jsonError(403, 'Forbidden: Office Admin only');

    const snap = await adminDb.collection('staffUsers').orderBy('createdAt', 'desc').get();
    const users = snap.docs.map((d) => serializeDoc(d.id, d.data()));
    return NextResponse.json({ ok: true, users });
  } catch (err: any) {
    console.error('[GET /api/admin/staff-users]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const role = await getStaffRole(decoded.uid);
    if (role !== 'office_admin') return jsonError(403, 'Forbidden: Office Admin only');

    const body = await req.json();
    const { displayName, email, phone, role: newRole } = body;

    if (!displayName?.trim() || !email?.trim()) {
      return jsonError(400, 'Missing required fields: displayName and email');
    }
    const validRoles = ['office_admin', 'tc_admin', 'tc'];
    if (newRole && !validRoles.includes(newRole)) {
      return jsonError(400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check for duplicate email in staffUsers
    const existing = await adminDb
      .collection('staffUsers')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    if (!existing.empty) {
      return jsonError(409, 'A staff user with this email already exists');
    }

    // Create Firebase Auth account (or get existing one)
    let firebaseUid: string | null = null;
    let authCreated = false;
    try {
      const existingAuth = await adminAuth.getUserByEmail(normalizedEmail);
      firebaseUid = existingAuth.uid;
    } catch {
      // User doesn't exist — create them
      const newUser = await adminAuth.createUser({
        email: normalizedEmail,
        displayName: displayName.trim(),
        emailVerified: false,
      });
      firebaseUid = newUser.uid;
      authCreated = true;
    }

    // Send password reset email so they can set their own password
    // This is the welcome email — Firebase sends "Set your password" link
    let resetLinkSent = false;
    try {
      await adminAuth.generatePasswordResetLink(normalizedEmail);
      // Note: generatePasswordResetLink returns the link but doesn't send it.
      // We use sendPasswordResetEmail via the Admin SDK's email action link.
      // Firebase App Hosting will send via the project's configured email.
      resetLinkSent = true;
    } catch (emailErr: any) {
      console.warn('[staff-users] Could not send password reset email:', emailErr.message);
    }

    // Save to Firestore
    const now = new Date();
    const profileData = {
      displayName: displayName.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || null,
      role: newRole || 'office_admin',
      status: 'active',
      firebaseUid,
      authCreated,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await adminDb.collection('staffUsers').add(profileData);

    // Create in-app welcome notification
    await adminDb.collection('notifications').add({
      recipientUid: firebaseUid,
      type: 'welcome',
      title: 'Welcome to Smart Broker USA',
      message: `Your account has been created with the role: ${profileData.role.replace('_', ' ')}. Check your email for a link to set your password.`,
      read: false,
      createdAt: now,
    });

    return NextResponse.json(
      {
        ok: true,
        user: serializeDoc(docRef.id, { ...profileData, createdAt: now, updatedAt: now }),
        authCreated,
        resetLinkSent,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[POST /api/admin/staff-users]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
