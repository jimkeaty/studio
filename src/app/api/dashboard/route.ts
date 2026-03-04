// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase/admin';
import { APP_CONFIG } from '@/lib/config';

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

function getYearFromReq(req: NextRequest): string {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || String(APP_CONFIG.dashboard.defaultYear);
  const n = Number(year);

  const allowedYears = new Set(APP_CONFIG.dashboard.allowedYears);
  if (!Number.isFinite(n) || !allowedYears.has(n)) {
    return String(APP_CONFIG.dashboard.defaultYear);
  }
  return String(n);
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const { uid, email, name } = decoded;

    const year = getYearFromReq(req);
    const userRef = adminDb.collection('users').doc(uid);

    // Upsert the user's profile info on every load for freshness.
    await userRef.set(
      {
        email,
        name: name || email, // Fallback name to email
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const userSnap = await userRef.get();
    const agentId = userSnap.exists ? userSnap.data()?.agentId : null;

    if (!agentId) {
      // If the user isn't linked to an agentId, tell the UI to show the linking prompt.
      return NextResponse.json({
        ok: true,
        needsLink: true,
        year: Number(year),
      });
    }

    // User is linked, so fetch their rollup data for the specified year.
    const rollupDocId = `${agentId}_${year}`;
    const rollupRef = adminDb.collection('agentYearRollups').doc(rollupDocId);
    const rollupSnap = await rollupRef.get();
    const rollup = rollupSnap.exists() ? rollupSnap.data() : null;

    return NextResponse.json({
      ok: true,
      year: Number(year),
      agentId,
      rollupDocId,
      rollup,
    });

  } catch (e: any) {
    console.error(`[API/dashboard] Error: ${e.message}`);
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Failed to load dashboard' },
      { status: 500 }
    );
  }
}
