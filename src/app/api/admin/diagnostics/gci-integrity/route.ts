import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const OPEN_STATUSES = new Set([
  'active', 'coming soon', 'coming_soon', 'pending', 'under contract', 'under_contract',
  'temp off market', 'temp_off_market', 'back on market', 'back_on_market',
]);

function amount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function firstAmount(...values: unknown[]): number {
  for (const value of values) {
    const parsed = amount(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const snap = await adminDb.collection('transactions').get();
    const resolvedOnOpen: any[] = [];
    const needsReview: any[] = [];
    let openCount = 0;
    let directGciCount = 0;

    for (const doc of snap.docs) {
      const tx = doc.data() as Record<string, any>;
      const status = String(tx.status || '').toLowerCase().trim();
      if (!OPEN_STATUSES.has(status)) continue;
      openCount++;

      const isPassThrough = Boolean(tx.passThrough || tx.isPassThrough || tx.dealSource === 'pass_through');
      if (isPassThrough) continue;

      const explicitGci = firstAmount(
        tx.gci, tx.splitSnapshot?.grossCommission, tx.splitSnapshot?.grossCommissionAmount,
        tx.grossCommission, tx.commission, tx.commissionAmount, tx.grossCommissionIncome,
      );
      if (explicitGci > 0) {
        directGciCount++;
        continue;
      }

      const basePrice = firstAmount(
        tx.commissionBasePrice, tx.salePrice, tx.soldPrice, tx.closingPrice,
        tx.purchasePrice, tx.listPrice, tx.dealValue,
      );
      const commissionRate = firstAmount(
        tx.commissionPercent, tx.sellerCommissionPct, tx.listingCommissionPct, tx.commissionRate,
      );
      const brokerAmount = firstAmount(
        tx.brokerGci, tx.companyRetained, tx.splitSnapshot?.brokerGci,
        tx.splitSnapshot?.brokerNetCommission, tx.brokerCommission,
      );
      const agentAmount = firstAmount(
        tx.agentDollar, tx.agentNetCommission, tx.splitSnapshot?.agentDollar,
        tx.splitSnapshot?.agentNetCommission, tx.agentCommission,
      );
      const calculatedGci = basePrice > 0 && commissionRate > 0 ? Math.round(basePrice * commissionRate) / 100 : 0;
      const splitInferredGci = brokerAmount > 0 && agentAmount > 0 ? Math.round((brokerAmount + agentAmount) * 100) / 100 : 0;
      const candidate = {
        id: doc.id,
        address: firstText(tx.propertyAddress, tx.address, tx.streetAddress) || '(no address)',
        agent: firstText(tx.agentName, tx.assignedAgentName, tx.agentDisplayName) || tx.agentId || '(unassigned)',
        status: tx.status || '(blank)',
        basePrice,
        commissionRate,
        brokerAmount,
        agentAmount,
        calculatedGci,
        splitInferredGci,
      };

      if (calculatedGci > 0 || splitInferredGci > 0) {
        resolvedOnOpen.push({
          ...candidate,
          resolution: calculatedGci > 0 ? 'Resolved from saved price × rate' : 'Resolved from saved broker + agent split',
          resolvedGci: calculatedGci || splitInferredGci,
        });
      } else if (basePrice > 0 || commissionRate > 0 || brokerAmount > 0 || agentAmount > 0) {
        needsReview.push({
          ...candidate,
          resolution: 'Insufficient saved values to resolve GCI automatically',
          resolvedGci: 0,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        openCount,
        directGciCount,
        resolvedOnOpenCount: resolvedOnOpen.length,
        needsReviewCount: needsReview.length,
      },
      resolvedOnOpen: resolvedOnOpen.sort((a, b) => a.address.localeCompare(b.address)),
      needsReview: needsReview.sort((a, b) => a.address.localeCompare(b.address)),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
