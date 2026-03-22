// POST /api/tc — any authenticated agent submits a new TC intake
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function toNum(v: any): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[$,%]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function toStr(v: any): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

const VALID_CLOSING_TYPES = new Set(['buyer', 'listing', 'referral']);
const VALID_DEAL_TYPES = new Set([
  'residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease',
]);
const VALID_SOURCES = new Set([
  'boomtown', 'referral', 'sphere', 'sign_call', 'company_gen',
  'social', 'open_house', 'fsbo', 'expired_listing', 'other',
]);

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || '';

    const body = await req.json();

    // Required fields
    const address = toStr(body.address);
    if (!address) return jsonError(400, 'address is required');

    const clientName = toStr(body.clientName);
    if (!clientName) return jsonError(400, 'clientName is required');

    const contractDate = toStr(body.contractDate);
    if (!contractDate) return jsonError(400, 'contractDate (under contract date) is required');

    const closingType = toStr(body.closingType);
    if (!closingType || !VALID_CLOSING_TYPES.has(closingType)) {
      return jsonError(400, 'closingType must be: buyer, listing, or referral');
    }

    const dealType = toStr(body.dealType) || 'residential_sale';
    if (!VALID_DEAL_TYPES.has(dealType)) {
      return jsonError(400, 'invalid dealType');
    }

    // Agent info — use requesting user if not overridden
    const agentId = toStr(body.agentId) || uid;
    const agentDisplayName = toStr(body.agentDisplayName) || toStr(decoded.name) || email;

    const now = new Date();

    const intake: Record<string, any> = {
      agentId,
      agentDisplayName,
      submittedByUid: uid,
      submittedByEmail: email,

      status: 'submitted',

      closingType,
      dealType,
      address,
      clientName,

      // Financial
      listPrice: toNum(body.listPrice),
      salePrice: toNum(body.salePrice),
      commissionPercent: toNum(body.commissionPercent),
      gci: toNum(body.gci),
      transactionFee: toNum(body.transactionFee),
      earnestMoney: toNum(body.earnestMoney),
      brokerPct: toNum(body.brokerPct),
      brokerGci: toNum(body.brokerGci),
      agentPct: toNum(body.agentPct),
      agentDollar: toNum(body.agentDollar),

      // Dates
      listingDate: toStr(body.listingDate),
      contractDate,
      optionExpiration: toStr(body.optionExpiration),
      inspectionDeadline: toStr(body.inspectionDeadline),
      surveyDeadline: toStr(body.surveyDeadline),
      projectedCloseDate: toStr(body.projectedCloseDate),
      closedDate: toStr(body.closedDate),

      // Client contact
      clientEmail: toStr(body.clientEmail),
      clientPhone: toStr(body.clientPhone),
      clientNewAddress: toStr(body.clientNewAddress),
      client2Name: toStr(body.client2Name),
      client2Email: toStr(body.client2Email),
      client2Phone: toStr(body.client2Phone),

      // Parties
      dealSource: VALID_SOURCES.has(toStr(body.dealSource) || '') ? toStr(body.dealSource) : toStr(body.dealSource),
      otherAgentName: toStr(body.otherAgentName),
      otherAgentEmail: toStr(body.otherAgentEmail),
      otherAgentPhone: toStr(body.otherAgentPhone),
      otherBrokerage: toStr(body.otherBrokerage),
      mortgageCompany: toStr(body.mortgageCompany),
      loanOfficer: toStr(body.loanOfficer),
      loanOfficerEmail: toStr(body.loanOfficerEmail),
      loanOfficerPhone: toStr(body.loanOfficerPhone),
      titleCompany: toStr(body.titleCompany),
      titleOfficer: toStr(body.titleOfficer),
      titleOfficerEmail: toStr(body.titleOfficerEmail),
      titleOfficerPhone: toStr(body.titleOfficerPhone),

      notes: toStr(body.notes),

      submittedAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('transactionIntakes').add(intake);

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    console.error('[POST /api/tc]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// GET /api/tc — agent fetches their own TC submissions
export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const snap = await adminDb
      .collection('transactionIntakes')
      .where('submittedByUid', '==', uid)
      .orderBy('submittedAt', 'desc')
      .limit(100)
      .get();

    const intakes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, intakes });
  } catch (err: any) {
    console.error('[GET /api/tc]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
