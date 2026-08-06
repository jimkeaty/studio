/**
 * GET /api/admin/zero-broker-commission
 * Returns all closed transactions where broker commission (companyRetained) is $0 or null,
 * grouped by agent. Used to identify potential pass-through transactions.
 * Excludes: referral-only closings, transactions already marked isPassThrough=true.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function num(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(token); }
  catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const allowed = await isAdminLike(decoded.uid);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = adminDb;

  // Fetch all closed transactions
  const snap = await db.collection('transactions').where('status', '==', 'closed').get();

  const results: any[] = [];

  for (const doc of snap.docs) {
    const t = doc.data() as any;

    // Skip already-marked pass-throughs
    if (t.isPassThrough === true) continue;

    // Skip referral closings — $0 broker commission is expected
    const closingType = String(t.closingType || '').toLowerCase();
    if (closingType === 'referral') continue;

    // Determine broker commission
    const brokerCommission = num(t.splitSnapshot?.companyRetained ?? t.brokerGci ?? t.companyDollar ?? null);
    const grossCommission = num(t.splitSnapshot?.grossCommission ?? t.commission ?? 0);

    // Only include transactions where broker gets $0 AND there is some GCI (i.e. not just missing data)
    if (brokerCommission > 0) continue;
    // If GCI is also 0, it's likely just incomplete data — skip unless salePrice is set
    if (grossCommission === 0 && num(t.salePrice) === 0 && num(t.listPrice) === 0) continue;

    results.push({
      id: doc.id,
      address: t.address || t.propertyAddress || '—',
      agentId: t.agentId || '',
      agentDisplayName: t.agentDisplayName || t.agentId || '—',
      closingType: t.closingType || '—',
      dealType: t.dealType || t.transactionType || '—',
      salePrice: num(t.salePrice) || num(t.listPrice) || 0,
      grossCommission,
      brokerCommission,
      closedDate: t.closedDate || t.closingDate || null,
      year: t.year || null,
      isPassThrough: !!t.isPassThrough,
      commissionOverridden: !!t.commissionOverridden,
    });
  }

  // Sort by agent name then closed date
  results.sort((a, b) => {
    const nameCompare = (a.agentDisplayName || '').localeCompare(b.agentDisplayName || '');
    if (nameCompare !== 0) return nameCompare;
    return (b.closedDate || '').localeCompare(a.closedDate || '');
  });

  return NextResponse.json({ count: results.length, transactions: results });
}
