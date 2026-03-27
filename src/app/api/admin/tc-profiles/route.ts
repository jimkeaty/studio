// GET /api/admin/tc-profiles — list all TC profiles
// POST /api/admin/tc-profiles — create a new TC profile
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden: Admin only');

    const snap = await adminDb
      .collection('tcProfiles')
      .get();

    const profiles = snap.docs.map((d) => ({
      id: d.id,
      ...serializeFirestore(d.data()),
    }));

    // Sort client-side to avoid composite index requirements
    profiles.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ ok: true, profiles });
  } catch (err: any) {
    console.error('[GET /api/admin/tc-profiles]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden: Admin only');

    const body = await req.json();

    const { displayName, email, phone, role, notifyOnNewIntake, notifyOnStatusChange } = body;

    if (!displayName || !email) {
      return jsonError(400, 'Missing required fields: displayName and email');
    }

    const validRoles = ['tc', 'tc_admin'];
    if (role && !validRoles.includes(role)) {
      return jsonError(400, `Invalid role: ${role}. Must be tc or tc_admin`);
    }

    const now = new Date();

    const profileData = {
      displayName: displayName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      role: role || 'tc',
      status: 'active' as const,
      notifyOnNewIntake: notifyOnNewIntake ?? true,
      notifyOnStatusChange: notifyOnStatusChange ?? true,
      assignedIntakeIds: [] as string[],
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection('tcProfiles').add(profileData);

    return NextResponse.json(
      {
        ok: true,
        profile: {
          id: docRef.id,
          ...profileData,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[POST /api/admin/tc-profiles]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
