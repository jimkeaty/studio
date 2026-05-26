// POST /api/admin/transactions/[id]/trigger-split
//
// Admin-only endpoint that manually triggers the co-agent split for a closed
// transaction that already has co-agent data saved but whose split never fired
// (e.g. because the original splitCoAgentTransaction had a displayName guard bug).
//
// Returns the IDs of the two newly created split transactions, or an error if
// the transaction does not qualify for splitting.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { splitCoAgentTransaction } from '@/lib/transactions/splitCoAgentTransaction';

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

    // ── Trigger split ────────────────────────────────────────────────────────
    const result = await splitCoAgentTransaction(id);

    if (!result) {
      return jsonError(422, 'Transaction does not qualify for splitting. Ensure hasCoAgent=true, coAgent.agentId is set, and the transaction has not already been split (source !== "co_agent_split").');
    }

    return NextResponse.json({
      ok: true,
      primaryTransactionId: result.primaryTransactionId,
      coAgentTransactionId: result.coAgentTransactionId,
    });
  } catch (err: any) {
    console.error('[api/admin/transactions/[id]/trigger-split POST]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
