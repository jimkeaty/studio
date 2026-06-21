// src/app/api/admin/broker-business-plan/reset/route.ts
// Resets the broker business plan start date to today without losing goals.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.match(/^Bearer (.+)$/i)?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const year = parseInt(body.year || String(new Date().getFullYear()), 10);
    const note = body.note || null;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const planRef = adminDb.collection('brokerBusinessPlans').doc(String(year));
    const snap = await planRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'No broker business plan found for this year.' }, { status: 404 });
    }

    await planRef.update({
      resetStartDate: todayStr,
      resetAt: today.toISOString(),
      resetBy: decoded.uid,
      resetNote: note,
      updatedAt: today.toISOString(),
    });

    return NextResponse.json({ ok: true, resetStartDate: todayStr, year });
  } catch (err: any) {
    console.error('[broker-business-plan/reset]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
