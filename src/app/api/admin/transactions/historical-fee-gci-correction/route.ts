import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import {
  buildHistoricalFeeGciCorrectionUpdate,
  HISTORICAL_FEE_GCI_CORRECTION_MANIFEST_ID,
  prepareHistoricalFeeGciCorrection,
  requireApprovedHistoricalFeeManifest,
} from '@/lib/transactions/historicalFeeGciCorrection';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * POST /api/admin/transactions/historical-fee-gci-correction
 *
 * A closed-manifest, admin-only repair path for the two audited 2026 records
 * approved on 2026-10-01. It intentionally bypasses the ordinary transaction
 * editor's recalculation, TC queue reopening, and notification behavior.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(authHeader.slice('Bearer '.length).trim());
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const body = await req.json();
    const corrections = requireApprovedHistoricalFeeManifest(
      body?.manifestId,
      body?.corrections,
    );

    const applied: Array<{
      id: string;
      address: string | null;
      agentId: string;
      year: number;
      before: Record<string, number>;
      after: Record<string, number>;
      progressionLeaderAgentId: string | null;
    }> = [];

    // Each record has its own serializable Firestore transaction. A re-read and
    // exact audit-value comparison occur inside the transaction so a stale audit
    // cannot overwrite an intervening authorized change.
    for (const correctionRequest of corrections) {
      const transactionRef = adminDb.collection('transactions').doc(correctionRequest.id);
      const auditRef = transactionRef.collection('auditEvents').doc();

      const corrected = await adminDb.runTransaction(async (firestoreTransaction) => {
        const transactionSnap = await firestoreTransaction.get(transactionRef);
        if (!transactionSnap.exists) {
          throw new Error(`Historical fee GCI correction rejected: transaction ${correctionRequest.id} no longer exists`);
        }

        const transactionData = transactionSnap.data() as Record<string, any>;
        const prepared = prepareHistoricalFeeGciCorrection(transactionData, correctionRequest);
        const now = new Date();
        const update = buildHistoricalFeeGciCorrectionUpdate(transactionData, prepared, now);

        firestoreTransaction.update(transactionRef, update);
        firestoreTransaction.create(auditRef, {
          eventType: 'historical_fee_gci_correction',
          manifestId: HISTORICAL_FEE_GCI_CORRECTION_MANIFEST_ID,
          actorUid: decoded.uid,
          actorEmail: decoded.email || null,
          createdAt: now.toISOString(),
          reason: 'Approved 2026 transaction-fee removal from saved gross commission',
          before: prepared.before,
          after: prepared.after,
          preserved: {
            transactionFee: prepared.before.transactionFee,
            agentNetCommission: prepared.before.agentNetCommission,
            companyRetained: prepared.before.companyRetained,
            status: transactionData.status || null,
          },
        });

        return {
          id: correctionRequest.id,
          address: String(transactionData.address || transactionData.propertyAddress || '').trim() || null,
          agentId: prepared.agentId,
          year: prepared.year,
          before: prepared.before,
          after: prepared.after,
          progressionLeaderAgentId: prepared.progressionLeaderAgentId,
        };
      });

      applied.push(corrected);
    }

    // Recompute derived dashboard and tier values from the corrected canonical
    // ledger. Do not adjust a rollup by hand and do not reopen a TC queue item.
    const rollupTargets = new Map<string, { agentId: string; year: number }>();
    for (const correction of applied) {
      rollupTargets.set(`${correction.agentId}_${correction.year}`, {
        agentId: correction.agentId,
        year: correction.year,
      });
      if (correction.progressionLeaderAgentId && correction.progressionLeaderAgentId !== correction.agentId) {
        rollupTargets.set(`${correction.progressionLeaderAgentId}_${correction.year}`, {
          agentId: correction.progressionLeaderAgentId,
          year: correction.year,
        });
      }
    }
    for (const target of rollupTargets.values()) {
      await rebuildAgentRollup(adminDb, target.agentId, target.year);
    }

    // Independent post-write re-read verifies the exact narrowed mutation.
    const verified = [];
    for (const correction of applied) {
      const snap = await adminDb.collection('transactions').doc(correction.id).get();
      const data = snap.data() as Record<string, any> | undefined;
      const snapshot = data?.splitSnapshot || {};
      const grossCommission = Number(snapshot.grossCommission ?? 0);
      const agentNetCommission = Number(snapshot.agentNetCommission ?? 0);
      const companyRetained = Number(snapshot.companyRetained ?? 0);
      if (
        Math.abs(grossCommission - correction.after.grossCommission) > 0.01 ||
        Math.abs(agentNetCommission - correction.after.agentNetCommission) > 0.01 ||
        Math.abs(companyRetained - correction.after.companyRetained) > 0.01
      ) {
        throw new Error(`Historical fee GCI correction verification failed for ${correction.id}`);
      }
      verified.push({
        id: correction.id,
        address: correction.address,
        grossCommission,
        agentNetCommission,
        companyRetained,
        transactionFee: Number(data?.transactionFee ?? data?.txComplianceFeeAmount ?? 0),
        status: data?.status || null,
      });
    }

    return NextResponse.json({
      ok: true,
      manifestId: HISTORICAL_FEE_GCI_CORRECTION_MANIFEST_ID,
      corrected: verified,
      rollupsRebuilt: Array.from(rollupTargets.values()),
    });
  } catch (error: any) {
    console.error('[historical-fee-gci-correction]', error);
    return jsonError(400, error?.message || 'Historical fee GCI correction failed');
  }
}
