// src/app/api/admin/audit-log/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAdminLike } from '@/lib/auth/staffAccess';


function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, targetUid, targetName, metadata } = body;

    if (!action || !targetUid) {
      return NextResponse.json({ ok: false, error: 'Missing required fields: action, targetUid' }, { status: 400 });
    }

    await adminDb.collection('adminAuditLog').add({
      adminUid: decoded.uid,
      action,
      targetUid,
      targetName: targetName ?? null,
      metadata: metadata ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Failed to log audit event' }, { status: 500 });
  }
}
