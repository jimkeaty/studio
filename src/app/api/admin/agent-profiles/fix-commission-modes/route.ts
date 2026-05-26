// src/app/api/admin/agent-profiles/fix-commission-modes/route.ts
// POST — one-time (safe to re-run) migration that ensures every agent profile
// with saved tiers has commissionMode = 'custom' so their tiers are always
// the source of truth in the commission route.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const snapshot = await adminDb.collection('agentProfiles').get();

    let scanned = 0;
    let fixed = 0;
    let skipped = 0;
    const fixedAgents: { id: string; displayName: string; from: string; to: string }[] = [];

    // Firestore batch limit is 500 writes — chunk if needed
    const batchSize = 400;
    let batch = adminDb.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      scanned++;
      const data = doc.data();
      const tiers: unknown[] = Array.isArray(data.tiers) ? data.tiers : [];
      const commissionMode: string = data.commissionMode || 'team_default';
      const flatAgentPercent = data.flatAgentPercent;
      const flatCompanyPercent = data.flatCompanyPercent;

      let needsUpdate = false;
      let newMode = commissionMode;

      // If the agent has saved tiers but commissionMode is not 'custom', fix it
      if (tiers.length > 0 && commissionMode !== 'custom' && commissionMode !== 'flat') {
        needsUpdate = true;
        newMode = 'custom';
      }
      // If the agent has flat percents set but commissionMode is not 'flat', fix it
      else if (
        tiers.length === 0 &&
        commissionMode !== 'flat' &&
        commissionMode !== 'custom' &&
        flatAgentPercent != null &&
        flatCompanyPercent != null &&
        Number(flatAgentPercent) + Number(flatCompanyPercent) === 100
      ) {
        needsUpdate = true;
        newMode = 'flat';
      }

      if (needsUpdate) {
        batch.update(doc.ref, { commissionMode: newMode });
        batchCount++;
        fixed++;
        fixedAgents.push({
          id: doc.id,
          displayName:
            data.displayName ||
            `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
            doc.id,
          from: commissionMode,
          to: newMode,
        });

        // Commit and start a new batch if we're approaching the limit
        if (batchCount >= batchSize) {
          await batch.commit();
          batch = adminDb.batch();
          batchCount = 0;
        }
      } else {
        skipped++;
      }
    }

    // Commit any remaining writes
    if (batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      scanned,
      fixed,
      skipped,
      fixedAgents,
      message:
        fixed > 0
          ? `Fixed ${fixed} agent profile${fixed === 1 ? '' : 's'}. Their saved tiers are now the source of truth.`
          : 'All agent profiles already have the correct commissionMode. No changes needed.',
    });
  } catch (err) {
    console.error('[fix-commission-modes] Error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
