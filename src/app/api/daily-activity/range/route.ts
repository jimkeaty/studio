// src/app/api/daily-activity/range/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import type { DailyActivity } from '@/lib/types';


// --- API Helpers ---
function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    { ok: false, error, code: code ?? `http_${status}` },
    { status }
  );
}

async function requireUser(req: NextRequest): Promise<{ uid: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing Authorization bearer token'), {
      status: 401,
      code: 'auth/missing-bearer',
    });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch (err: any) {
    throw Object.assign(new Error('Invalid or expired token'), {
      status: 401,
      code: 'auth/invalid-token',
      details: err?.code,
    });
  }
}

// --- Route Handler ---
export async function GET(req: NextRequest) {
  try {
    const { uid: callerUid } = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const viewAs = searchParams.get('viewAs');
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    if (!start || !end) {
      return jsonError(400, 'Missing required query params: start, end');
    }

    const q = adminDb
      .collection('daily_activity')
      .where('agentId', '==', uid)
      .where('date', '>=', start)
      .where('date', '<=', end);

    const snap = await q.get();

    const activitiesByDate: Record<string, DailyActivity> = {};
    snap.forEach((doc) => {
      const data = doc.data() as DailyActivity & { date: string };
      activitiesByDate[data.date] = { id: doc.id, ...data } as DailyActivity & { id: string; date: string };
    });

    return NextResponse.json({ ok: true, activities: activitiesByDate });
  } catch (err: any) {
    return jsonError(
      err.status ?? 500,
      err.message ?? 'Failed to load activity range',
      err.code
    );
  }
}
