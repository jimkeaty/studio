'use server';
// GET /api/admin/diagnostics/tx-field-lookup?address=101+Chestnut+Oak
// Returns the raw Firestore field names and values for all transactions whose
// address (any field) contains the search string. Used to diagnose why the
// bulk-delete matcher can't find certain transactions.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
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
    const addressQuery = norm(searchParams.get('address') || '');
    const agentQuery = norm(searchParams.get('agent') || '');

    if (!addressQuery) {
      return NextResponse.json({ error: 'address param required' }, { status: 400 });
    }

    const snap = await adminDb.collection('transactions').get();
    const matches: any[] = [];

    for (const doc of snap.docs) {
      const t = doc.data();
      const addrFields = [
        t.address, t.propertyAddress, t.streetAddress, t.fullAddress,
      ].filter(Boolean);

      const normAddrs = addrFields.map(a => norm(a));
      const addrMatch = normAddrs.some(a => a.includes(addressQuery) || addressQuery.includes(a.split(' ').slice(0, 3).join(' ')));

      if (!addrMatch) continue;

      // If agent filter provided, also check agent name fields
      if (agentQuery) {
        const agentFields = [
          t.agentDisplayName, t.agentName,
          t.agentFirstName && t.agentLastName ? `${t.agentFirstName} ${t.agentLastName}` : null,
          t.agent?.displayName, t.agent?.name,
        ].filter(Boolean).map(a => norm(a));
        const agentMatch = agentFields.some(a => a.includes(agentQuery) || agentQuery.includes(a));
        if (!agentMatch) continue;
      }

      matches.push({
        id: doc.id,
        // Show all potentially relevant fields
        status: t.status,
        address: t.address,
        propertyAddress: t.propertyAddress,
        streetAddress: t.streetAddress,
        fullAddress: t.fullAddress,
        agentDisplayName: t.agentDisplayName,
        agentName: t.agentName,
        agentId: t.agentId,
        agentFirstName: t.agentFirstName,
        agentLastName: t.agentLastName,
        listingDate: t.listingDate,
        closedDate: t.closedDate,
        closeDate: t.closeDate,
        dealSource: t.dealSource,
        closingType: t.closingType,
        year: t.year,
      });
    }

    return NextResponse.json({ ok: true, addressQuery, agentQuery, count: matches.length, matches });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
