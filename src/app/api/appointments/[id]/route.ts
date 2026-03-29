// src/app/api/appointments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, admin } from '@/lib/firebase/admin';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';
import { FieldValue } from 'firebase-admin/firestore';
import { differenceInDays } from 'date-fns';

const EDIT_WINDOW_DAYS = 45;

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json({ ok: false, error, code: code ?? `http_${status}` }, { status });
}

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw { status: 401, message: 'Missing Authorization bearer token', code: 'auth/missing-bearer' };
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const role = userSnap.exists ? userSnap.data()?.role : 'agent';
    return { uid: decoded.uid, role };
  } catch (err: any) {
    throw { status: 401, message: 'Invalid or expired token', code: 'auth/invalid-token' };
  }
}

function isDateEditable(dateStr: string, role: string): boolean {
    if (role === 'admin') return true;
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    const diff = differenceInDays(
        new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        new Date(date.getFullYear(), date.getMonth(), date.getDate())
    );
    return diff <= EDIT_WINDOW_DAYS;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { uid: callerUid, role } = await requireUser(req);
    const { id } = params;
    const body = await req.json();

    // Admin can patch on behalf of any agent
    const viewAs = body?.viewAs;
    const uid = (callerUid === ADMIN_UID && viewAs) ? viewAs : callerUid;
    const effectiveRole = callerUid === ADMIN_UID ? 'admin' : role;

    const docRef = adminDb.collection('appointments').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return jsonError(404, 'Appointment not found');
    }

    const data = docSnap.data()!;
    if (data.agentId !== uid) {
      return jsonError(403, 'You do not have permission to edit this appointment');
    }

    // Check edit window on the original date
    if (!isDateEditable(data.date, effectiveRole)) {
        return jsonError(403, 'Edits are locked after 45 days.', 'edit_window_expired');
    }
    // Also check if the date is being changed to a locked date
    if (body.date && !isDateEditable(body.date, role)) {
        return jsonError(403, 'Cannot move appointment to a date that is locked for edits.', 'edit_window_expired');
    }

    const dataToUpdate = { ...body, updatedAt: FieldValue.serverTimestamp() };
    await docRef.update(dataToUpdate);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(err.status ?? 500, err.message ?? 'Failed to update appointment');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { uid: callerUid, role } = await requireUser(req);
    const { id } = params;

    // For DELETE, check if the doc belongs to the impersonated agent
    const isAdmin = callerUid === ADMIN_UID;
    const effectiveRole = isAdmin ? 'admin' : role;

    const docRef = adminDb.collection('appointments').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return jsonError(404, 'Appointment not found');
    }

    const data = docSnap.data()!;
    // Admin can delete any appointment; agents can only delete their own
    if (!isAdmin && data.agentId !== callerUid) {
      return jsonError(403, 'You do not have permission to delete this appointment');
    }

    if (!isDateEditable(data.date, effectiveRole)) {
        return jsonError(403, 'Deletions are locked after 45 days.', 'edit_window_expired');
    }

    await docRef.delete();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(err.status ?? 500, err.message ?? 'Failed to delete appointment');
  }
}
