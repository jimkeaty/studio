// GET    /api/competitions/[competitionId] — get single competition
// PATCH  /api/competitions/[competitionId] — update competition config
// DELETE /api/competitions/[competitionId] — delete competition
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { CompetitionConfig } from '@/lib/competitions/types';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

/** Recursively strip undefined values so Firestore doesn't reject the write. */
function stripUndefined(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (typeof obj === 'object' && obj.constructor === Object) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out;
  }
  return obj;
}

type RouteContext = { params: Promise<{ competitionId: string }> };

// ── GET: Single competition ─────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden');

    const { competitionId } = await ctx.params;
    const doc = await adminDb.collection('competitions').doc(competitionId).get();

    if (!doc.exists) return jsonError(404, 'Competition not found');

    return NextResponse.json({
      ok: true,
      competition: { id: doc.id, config: doc.data()!.config as CompetitionConfig },
    });
  } catch (err: any) {
    console.error('[api/competitions/[id] GET]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── PATCH: Update competition config ────────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden');

    const { competitionId } = await ctx.params;
    const ref = adminDb.collection('competitions').doc(competitionId);
    const doc = await ref.get();

    if (!doc.exists) return jsonError(404, 'Competition not found');

    const updates = (await req.json()) as Partial<CompetitionConfig>;
    const existingConfig = doc.data()!.config as CompetitionConfig;

    const mergedConfig: CompetitionConfig = {
      ...existingConfig,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await ref.update({ config: stripUndefined(mergedConfig) });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[api/competitions/[id] PATCH]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── DELETE: Remove competition ──────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden');

    const { competitionId } = await ctx.params;
    const ref = adminDb.collection('competitions').doc(competitionId);
    const doc = await ref.get();

    if (!doc.exists) return jsonError(404, 'Competition not found');

    await ref.delete();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[api/competitions/[id] DELETE]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
