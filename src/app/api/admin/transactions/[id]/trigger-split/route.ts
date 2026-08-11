// POST /api/admin/transactions/[id]/trigger-split
// Legacy endpoint intentionally disabled. Co-agent accounting now remains on
// one permanent transaction document with participant allocations.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    // ── Params ───────────────────────────────────────────────────────────────
    const { id } = await context.params;
    if (!id) return jsonError(400, 'Transaction id is required');

    return NextResponse.json({
      ok: false,
      error: 'Legacy co-agent splitting is disabled. This transaction remains one shared file with participant allocations.',
      transactionId: id,
    }, { status: 409 });
  } catch (err: any) {
    console.error('[api/admin/transactions/[id]/trigger-split POST]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
