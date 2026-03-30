// PATCH + DELETE /api/admin/tc-profiles/[profileId] — update or delete a TC profile
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

type Params = { params: Promise<{ profileId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const { profileId } = await params;
    const body = await req.json();

    const docRef = adminDb.collection('tcProfiles').doc(profileId);
    const doc = await docRef.get();
    if (!doc.exists) return jsonError(404, 'TC profile not found');

    const now = new Date();
    const updates: Record<string, any> = { updatedAt: now };

    const allowedFields = [
      'displayName',
      'email',
      'phone',
      'role',
      'status',
      'notifyOnNewIntake',
      'notifyOnStatusChange',
      'assignedIntakeIds',
    ];

    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'role') {
          const validRoles = ['tc', 'tc_admin'];
          if (!validRoles.includes(body.role)) {
            return jsonError(400, `Invalid role: ${body.role}`);
          }
        }
        if (field === 'status') {
          const validStatuses = ['active', 'inactive'];
          if (!validStatuses.includes(body.status)) {
            return jsonError(400, `Invalid status: ${body.status}`);
          }
        }
        if (field === 'email') {
          updates[field] = body[field].trim().toLowerCase();
        } else if (typeof body[field] === 'string') {
          updates[field] = body[field].trim();
        } else {
          updates[field] = body[field];
        }
      }
    }

    await docRef.update(updates);

    const updatedDoc = await docRef.get();
    const data = updatedDoc.data()!;

    return NextResponse.json({
      ok: true,
      profile: {
        id: updatedDoc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? data.updatedAt,
      },
    });
  } catch (err: any) {
    console.error('[PATCH /api/admin/tc-profiles/[profileId]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const { profileId } = await params;

    const docRef = adminDb.collection('tcProfiles').doc(profileId);
    const doc = await docRef.get();
    if (!doc.exists) return jsonError(404, 'TC profile not found');

    await docRef.delete();

    return NextResponse.json({ ok: true, deleted: profileId });
  } catch (err: any) {
    console.error('[DELETE /api/admin/tc-profiles/[profileId]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
