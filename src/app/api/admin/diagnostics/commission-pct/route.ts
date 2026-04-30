'use server';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function parseDate(raw: any): Date | null {
  if (!raw) return null;
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (typeof raw === 'string') {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    // Fetch all closed transactions for the year
    const snap = await adminDb.collection('transactions')
      .where('status', '==', 'closed')
      .get();

    let totalClosed = 0;
    let passThroughCount = 0;
    let includedCount = 0;
    let totalGCI = 0;
    let totalVolume = 0;
    let commissionVolume = 0; // non-pass-through volume
    let zeroGCICount = 0;
    let missingDealValueCount = 0;

    const passThroughExamples: any[] = [];
    const zeroGCIExamples: any[] = [];

    for (const doc of snap.docs) {
      const t = doc.data();
      const closedDate = parseDate(t.closedDate);
      if (!closedDate || closedDate.getFullYear() !== year) continue;

      totalClosed++;
      const gci = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
      const dealValue = t.dealValue ?? 0;
      const dealSource = (t.dealSource || '').toLowerCase();
      const isPassThrough = dealSource === 'pass_through';

      totalVolume += dealValue;

      if (isPassThrough) {
        passThroughCount++;
        if (passThroughExamples.length < 5) {
          passThroughExamples.push({
            id: doc.id,
            address: t.propertyAddress || t.address || '(no address)',
            agent: t.agentName || t.agentId || '(unknown)',
            dealValue,
            gci,
            commPct: dealValue > 0 ? ((gci / dealValue) * 100).toFixed(3) + '%' : 'n/a',
          });
        }
      } else {
        includedCount++;
        totalGCI += gci;
        commissionVolume += dealValue;
        if (dealValue === 0) missingDealValueCount++;
        if (gci === 0) {
          zeroGCICount++;
          if (zeroGCIExamples.length < 5) {
            zeroGCIExamples.push({
              id: doc.id,
              address: t.propertyAddress || t.address || '(no address)',
              agent: t.agentName || t.agentId || '(unknown)',
              dealValue,
              dealSource: t.dealSource || 'n/a',
              closedDate: closedDate.toISOString().split('T')[0],
            });
          }
        }
      }
    }

    const avgCommPctOld = totalVolume > 0
      ? Math.round((totalGCI / totalVolume) * 100000) / 1000 : 0;
    const avgCommPctNew = commissionVolume > 0
      ? Math.round((totalGCI / commissionVolume) * 100000) / 1000 : 0;

    return NextResponse.json({
      ok: true,
      year,
      totalClosed,
      passThroughCount,
      includedCount,
      zeroGCICount,
      missingDealValueCount,
      totalGCI: Math.round(totalGCI),
      totalVolume: Math.round(totalVolume),
      commissionVolume: Math.round(commissionVolume),
      avgCommPctOld,   // old calculation (includes pass-through volume in denominator)
      avgCommPctNew,   // new calculation (excludes pass-through volume from denominator)
      passThroughExamples,
      zeroGCIExamples,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
