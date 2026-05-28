// Temporary debug endpoint to check tier data — DELETE after debugging
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';


export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/i);
    const token = match?.[1];
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId') || '';

    const debug: any = { agentId, lookupResults: {} };

    // Strategy 1: doc ID
    const byDocId = await adminDb.collection('agentProfiles').doc(agentId).get();
    debug.lookupResults.byDocId = byDocId.exists
      ? {
          found: true,
          docId: byDocId.id,
          agentId: byDocId.data()?.agentId,
          displayName: byDocId.data()?.displayName,
          email: byDocId.data()?.email,
          startDate: byDocId.data()?.startDate,
          anniversaryMonth: byDocId.data()?.anniversaryMonth,
          anniversaryDay: byDocId.data()?.anniversaryDay,
          tiersCount: Array.isArray(byDocId.data()?.tiers) ? byDocId.data()!.tiers.length : 0,
          tiers: byDocId.data()?.tiers ?? null,
        }
      : { found: false };

    // Strategy 2: agentId field
    const byFieldSnap = await adminDb.collection('agentProfiles')
      .where('agentId', '==', agentId).limit(1).get();
    debug.lookupResults.byAgentIdField = !byFieldSnap.empty
      ? {
          found: true,
          docId: byFieldSnap.docs[0].id,
          displayName: byFieldSnap.docs[0].data()?.displayName,
          tiersCount: Array.isArray(byFieldSnap.docs[0].data()?.tiers) ? byFieldSnap.docs[0].data()!.tiers.length : 0,
        }
      : { found: false };

    // Check transactions for this agent (all years, all statuses)
    const txSnap = await adminDb.collection('transactions')
      .where('agentId', '==', agentId)
      .get();

    debug.transactions = {
      total: txSnap.size,
      samples: txSnap.docs.map(d => {
        const t = d.data();
        return {
          id: d.id,
          status: t.status,
          year: t.year,
          closedDate: t.closedDate,
          commission: t.commission,
          dealValue: t.dealValue,
          hasSplitSnapshot: !!t.splitSnapshot,
          splitGrossCommission: t.splitSnapshot?.grossCommission ?? null,
          splitCompanyRetained: t.splitSnapshot?.companyRetained ?? null,
          hasCreditSnapshot: !!t.creditSnapshot,
          progressionCredit: t.creditSnapshot?.progressionCompanyDollarCredit ?? null,
        };
      }),
    };

    // Check the rollup documents for this agent
    const rollupSnap2025 = await adminDb.collection('agentYearRollups').doc(`${agentId}_2025`).get();
    const rollupSnap2026 = await adminDb.collection('agentYearRollups').doc(`${agentId}_2026`).get();
    debug.rollups = {
      _2025: rollupSnap2025.exists ? {
        tierProgressionGci: rollupSnap2025.data()?.tierProgressionGci ?? 'MISSING',
        tierProgressionCompanyDollar: rollupSnap2025.data()?.tierProgressionCompanyDollar ?? 'MISSING',
        cycleStart: rollupSnap2025.data()?.cycleStart,
        cycleEnd: rollupSnap2025.data()?.cycleEnd,
        rebuiltAt: rollupSnap2025.data()?.rebuiltAt,
      } : 'NOT FOUND',
      _2026: rollupSnap2026.exists ? {
        tierProgressionGci: rollupSnap2026.data()?.tierProgressionGci ?? 'MISSING',
        tierProgressionCompanyDollar: rollupSnap2026.data()?.tierProgressionCompanyDollar ?? 'MISSING',
        cycleStart: rollupSnap2026.data()?.cycleStart,
        cycleEnd: rollupSnap2026.data()?.cycleEnd,
        rebuiltAt: rollupSnap2026.data()?.rebuiltAt,
      } : 'NOT FOUND',
    };

    // List first 5 agent profiles to see what doc IDs look like
    const allSnap = await adminDb.collection('agentProfiles').limit(10).get();
    debug.allProfileDocIds = allSnap.docs.map(d => ({
      docId: d.id,
      agentId: d.data().agentId,
      displayName: d.data().displayName,
      tiersCount: Array.isArray(d.data().tiers) ? d.data().tiers.length : 0,
    }));

    return NextResponse.json({ ok: true, debug });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
