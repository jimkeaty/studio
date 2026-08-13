import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function normalize(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function present(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '' && value !== 0;
}

function summarize(id: string, collection: string, raw: Record<string, any>) {
  const nested = ['transactionData', 'formData', 'details', 'data']
    .map((key) => ({ key, value: raw[key] }))
    .filter(({ value }) => value && typeof value === 'object' && !Array.isArray(value));
  const lookup = (...keys: string[]) => {
    for (const key of keys) {
      if (present(raw[key])) return raw[key];
      for (const entry of nested) if (present(entry.value[key])) return entry.value[key];
    }
    return null;
  };
  const dates = {
    listingDate: lookup('listingDate', 'listDate'),
    listingExpirationDate: lookup('listingExpirationDate', 'expirationDate', 'listingExpiration'),
    contractDate: lookup('contractDate', 'underContractDate'),
    projectedCloseDate: lookup('projectedCloseDate', 'closingDate', 'actualCloseDate', 'closedDate'),
  };
  const commission = {
    salePrice: lookup('salePrice', 'finalSalePrice', 'closedSalePrice', 'dealValue'),
    listPrice: lookup('listPrice'),
    commissionPercent: lookup('commissionPercent', 'sellerCommissionPct', 'listingCommissionPct'),
    gci: lookup('gci', 'grossCommission', 'commission', 'commissionAmount', 'grossCommissionIncome'),
    brokerGci: lookup('brokerGci', 'companyRetained'),
    agentDollar: lookup('agentDollar', 'agentNetCommission', 'agentCommission'),
  };
  const clients = {
    clientName: lookup('clientName'),
    sellerName: lookup('sellerName', 'seller1Name'),
    buyerName: lookup('buyerName', 'buyer1Name'),
    clientEmail: lookup('clientEmail', 'sellerEmail', 'buyerEmail'),
  };
  return {
    id,
    collection,
    transactionId: raw.transactionId || null,
    address: lookup('propertyAddress', 'address', 'streetAddress') || '(no address)',
    status: lookup('status', 'listingStatus') || '(blank)',
    dates,
    commission,
    clients,
    nestedContainers: nested.map(({ key }) => key),
    rawFieldCount: Object.keys(raw).length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!(await isAdminLike(decoded.uid))) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const query = req.nextUrl.searchParams.get('address') || '';
    const needle = normalize(query);
    if (needle.length < 5) return NextResponse.json({ ok: false, error: 'Enter at least five characters of the address.' }, { status: 400 });

    const [transactionSnap, staffQueueSnap] = await Promise.all([
      adminDb.collection('transactions').get(),
      adminDb.collection('staffQueue').get(),
    ]);
    const matches: any[] = [];
    for (const doc of transactionSnap.docs) {
      const raw = doc.data();
      const address = normalize(raw.propertyAddress || raw.address || raw.streetAddress);
      if (address.includes(needle) || needle.includes(address)) matches.push(summarize(doc.id, 'transactions', raw));
    }
    for (const doc of staffQueueSnap.docs) {
      const raw = doc.data();
      const address = normalize(raw.propertyAddress || raw.address || raw.streetAddress || raw.transaction?.propertyAddress || raw.transaction?.address);
      if (address.includes(needle) || needle.includes(address)) matches.push(summarize(doc.id, 'staffQueue', raw));
    }
    return NextResponse.json({ ok: true, query, found: matches.length, records: matches });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
