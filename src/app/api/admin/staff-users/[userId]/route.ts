// PATCH + DELETE /api/admin/staff-users/[userId]
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

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const callerRole = await getStaffRole(decoded.uid);
    if (callerRole !== 'office_admin') return jsonError(403, 'Forbidden: Office Admin only');

    const { userId } = await params;
    const body = await req.json();
    const docRef = adminDb.collection('staffUsers').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) return jsonError(404, 'Staff user not found');

    const now = new Date();
    const updates: Record<string, any> = { updatedAt: now };
    const allowed = ['displayName', 'phone', 'role', 'status'];
    for (const field of allowed) {
      if (!(field in body)) continue;
      if (field === 'role') {
        const validRoles = ['office_admin', 'tc_admin', 'tc'];
        if (!validRoles.includes(body.role)) return jsonError(400, \`Invalid role: \${body.role}\`);
      }
      if (field === 'status') {
        const validStatuses = ['active', 'inactive'];
        if (!validStatuses.includes(body.status)) return jsonError(400, \`Invalid status: \${body.status}\`);
        // Sync Firebase Auth disabled state
        const { firebaseUid } = doc.data()!;
        if (firebaseUid) {
          await adminAuth.updateUser(firebaseUid, { disabled: body.status === 'inactive' });
        }
      }
      updates[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
    }
    await docRef.update(updates);
    const updated = await docRef.get();
    const data = updated.data()!;
    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? data.updatedAt,
      },
    });
  } catch (err: any) {
    console.error('[PATCH /api/admin/staff-users/[userId]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const callerRole = await getStaffRole(decoded.uid);
    if (callerRole !== 'office_admin') return jsonError(403, 'Forbidden: Office Admin only');

    const { userId } = await params;
    const docRef = adminDb.collection('staffUsers').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) return jsonError(404, 'Staff user not found');

    const { firebaseUid } = doc.data()!;
    // Disable Firebase Auth account (soft delete — preserves data)
    if (firebaseUid) {
      try { await adminAuth.updateUser(firebaseUid, { disabled: true }); } catch {}
    }
    // Soft delete — mark inactive rather than hard delete
    await docRef.update({ status: 'inactive', updatedAt: new Date() });
    return NextResponse.json({ ok: true, deactivated: userId });
  } catch (err: any) {
    console.error('[DELETE /api/admin/staff-users/[userId]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
