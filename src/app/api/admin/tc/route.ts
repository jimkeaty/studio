// GET /api/admin/tc — admin fetches all TC intakes
// POST /api/admin/tc — create a new TC intake (admin-side, full field set)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike, isStaff } from '@/lib/auth/staffAccess';
import { reopenTcIntakeForTransaction } from '@/lib/transactions/tcQueueLifecycle';

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
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

function workflowPriority(status: unknown): number {
  switch (String(status || '').trim().toLowerCase()) {
    case 'submitted': return 4;
    case 'in_review': return 3;
    case 'approved': return 2;
    case 'rejected': return 1;
    default: return 0;
  }
}

function queueActivityTime(intake: Record<string, any>): number {
  const value = intake.queueUpdatedAt || intake.lastChangedAt || intake.updatedAt || intake.submittedAt;
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Historic paths could create more than one TC wrapper for the same canonical
 * transaction. The queue is an index, not a second transaction store, so return
 * one durable row per transaction without mutating or deleting historic data.
 */
function dedupeTcQueueIntakes(intakes: Array<Record<string, any>>) {
  const byTransaction = new Map<string, Record<string, any>>();
  for (const intake of intakes) {
    const transactionId = String(
      intake.transactionId || intake.approvedTransactionId || intake.originalTransactionId || intake.id,
    ).trim();
    const existing = byTransaction.get(transactionId);
    if (!existing) {
      byTransaction.set(transactionId, intake);
      continue;
    }

    const intakeUsesDeterministicId = String(intake.id) === transactionId;
    const existingUsesDeterministicId = String(existing.id) === transactionId;
    const statusDifference = workflowPriority(intake.status) - workflowPriority(existing.status);
    const shouldReplace =
      statusDifference > 0 ||
      (statusDifference === 0 && intakeUsesDeterministicId && !existingUsesDeterministicId) ||
      (statusDifference === 0 && intakeUsesDeterministicId === existingUsesDeterministicId && queueActivityTime(intake) > queueActivityTime(existing));
    if (shouldReplace) byTransaction.set(transactionId, intake);
  }
  return Array.from(byTransaction.values());
}

const VALID_CLOSING_TYPES = new Set(['buyer', 'listing', 'referral', 'dual']);
const VALID_DEAL_TYPES = new Set([
  'residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease',
]);

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    // TC staff (tc, tc_admin, office_admin) can all view the queue
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden: Staff only');

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status'); // optional
    // active=true returns only non-approved/non-rejected records (the working queue)
    const activeOnly = url.searchParams.get('active') === 'true';

    let query: FirebaseFirestore.Query = adminDb
      .collection('tcIntakes')
      .limit(500);

    if (activeOnly) {
      // Active queue: submitted + in_review only
      query = adminDb
        .collection('tcIntakes')
        .where('status', 'in', ['submitted', 'in_review'])
        .limit(500);
    } else if (statusFilter && statusFilter !== 'all') {
      query = adminDb
        .collection('tcIntakes')
        .where('status', '==', statusFilter)
        .limit(500);
    }

    const snap = await query.get();

    // ── Filter out demo account TC intakes ──────────────────────────────
    const demoSnap = await adminDb.collection('agentProfiles').where('isDemoAccount', '==', true).get();
    const demoAgentIds = new Set(demoSnap.docs.map(d => String(d.data().agentId || d.id)));

    const rawIntakes = snap.docs
      .filter(d => {
        if (demoAgentIds.size === 0) return true;
        const agentId = String(d.data().agentId || '');
        return !demoAgentIds.has(agentId);
      })
      .map((d) => ({
        id: d.id,
        ...serializeFirestore(d.data()),
      }));
    const intakes = dedupeTcQueueIntakes(rawIntakes);

    // Recently changed/reopened records lead the queue. Fall back to the
    // original submission time for historic items that predate queue activity.
    intakes.sort((a, b) => {
      return queueActivityTime(b) - queueActivityTime(a);
    });

    return NextResponse.json({ ok: true, intakes });
  } catch (err: any) {
    console.error('[GET /api/admin/tc]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    // TC staff (tc, tc_admin, office_admin) can all view the queue
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden: Staff only');

    const body = await req.json();

    if (!body.agentId || !body.address) {
      return jsonError(400, 'Missing required fields: agentId and address');
    }

    const closingType = toStr(body.closingType);
    if (closingType && !VALID_CLOSING_TYPES.has(closingType)) {
      return jsonError(400, 'closingType must be: buyer, listing, dual, or referral');
    }

    const dealType = toStr(body.dealType) || 'residential_sale';
    if (!VALID_DEAL_TYPES.has(dealType)) {
      return jsonError(400, 'invalid dealType');
    }

    const now = new Date();

    const intakeData: Record<string, any> = {
      // Identity
      agentId: toStr(body.agentId),
      agentDisplayName: toStr(body.agentDisplayName) || '',
      submittedByUid: decoded.uid,
      submittedByEmail: decoded.email || '',

      status: 'submitted',

      // Core
      closingType: closingType || null,
      dealType,
      address: toStr(body.address),
      clientName: toStr(body.clientName) || '',
      dealSource: toStr(body.dealSource),

      // Financial
      listPrice: toNum(body.listPrice),
      salePrice: toNum(body.salePrice),
      commissionPercent: toNum(body.commissionPercent),
      commissionBasePrice: toNum(body.commissionBasePrice) || toNum(body.salePrice) || null,
      gci: toNum(body.gci),
      transactionFee: toNum(body.transactionFee),
      earnestMoney: toNum(body.earnestMoney),
      depositHolderOther: toStr(body.depositHolderOther),

      // Commission split (admin can set these directly)
      brokerPct: toNum(body.brokerPct),
      brokerGci: toNum(body.brokerGci),
      agentPct: toNum(body.agentPct),
      agentDollar: toNum(body.agentDollar),

      // Commission override metadata
      commissionOverride: !!body.commissionOverride,
      commissionOverrideBy: body.commissionOverride ? (decoded.email || decoded.uid) : null,
      commissionOverrideAt: body.commissionOverride ? now : null,

      // Dates
      listingDate: toStr(body.listingDate),
      contractDate: toStr(body.contractDate),
      optionExpiration: toStr(body.optionExpiration),
      inspectionDeadline: toStr(body.inspectionDeadline),
      surveyDeadline: toStr(body.surveyDeadline),
      projectedCloseDate: toStr(body.projectedCloseDate),
      closedDate: toStr(body.closedDate),
      loanApplicationDeadline: toStr(body.loanApplicationDeadline),
      appraisalDeadline: toStr(body.appraisalDeadline),
      titleDeadline: toStr(body.titleDeadline),
      finalLoanCommitmentDeadline: toStr(body.finalLoanCommitmentDeadline),

      // Client contact
      clientEmail: toStr(body.clientEmail),
      clientPhone: toStr(body.clientPhone),
      clientNewAddress: toStr(body.clientNewAddress),
      client2Name: toStr(body.client2Name),
      client2Email: toStr(body.client2Email),
      client2Phone: toStr(body.client2Phone),

      // Buyer contact
      buyerName: toStr(body.buyerName),
      buyerEmail: toStr(body.buyerEmail),
      buyerPhone: toStr(body.buyerPhone),
      buyer2Name: toStr(body.buyer2Name),
      buyer2Email: toStr(body.buyer2Email),
      buyer2Phone: toStr(body.buyer2Phone),

      // Seller contact
      sellerName: toStr(body.sellerName),
      sellerEmail: toStr(body.sellerEmail),
      sellerPhone: toStr(body.sellerPhone),
      seller2Name: toStr(body.seller2Name),
      seller2Email: toStr(body.seller2Email),
      seller2Phone: toStr(body.seller2Phone),

      // Other agent / brokerage
      otherAgentName: toStr(body.otherAgentName),
      otherAgentEmail: toStr(body.otherAgentEmail),
      otherAgentPhone: toStr(body.otherAgentPhone),
      otherBrokerage: toStr(body.otherBrokerage),

      // Lender / mortgage
      mortgageCompany: toStr(body.mortgageCompany),
      loanOfficer: toStr(body.loanOfficer),
      loanOfficerEmail: toStr(body.loanOfficerEmail),
      loanOfficerPhone: toStr(body.loanOfficerPhone),
      lenderOffice: toStr(body.lenderOffice),

      // Title
      titleCompany: toStr(body.titleCompany),
      titleOfficer: toStr(body.titleOfficer),
      titleOfficerEmail: toStr(body.titleOfficerEmail),
      titleOfficerPhone: toStr(body.titleOfficerPhone),
      titleAttorney: toStr(body.titleAttorney),
      titleOffice: toStr(body.titleOffice),

      // Inspection
      targetInspectionDate: toStr(body.targetInspectionDate),
      inspectionTypes: Array.isArray(body.inspectionTypes) ? body.inspectionTypes : [],
      tcScheduleInspectionsOther: toStr(body.tcScheduleInspectionsOther),
      inspectorName: toStr(body.inspectorName),

      // Seller commission fields
      sellerPayingListingAgent: toNum(body.sellerPayingListingAgent),
      sellerPayingListingAgentUnknown: !!body.sellerPayingListingAgentUnknown,
      sellerPayingBuyerAgent: toNum(body.sellerPayingBuyerAgent),

      // Buyer closing costs
      buyerClosingCostTotal: toNum(body.buyerClosingCostTotal),
      buyerClosingCostAgentCommission: toNum(body.buyerClosingCostAgentCommission),
      buyerClosingCostTxFee: toNum(body.buyerClosingCostTxFee),
      buyerClosingCostOther: toNum(body.buyerClosingCostOther),

      // Compliance / warranty
      warrantyPaidBy: toStr(body.warrantyPaidBy),
      txComplianceFeeAmount: toNum(body.txComplianceFeeAmount),
      txComplianceFeePaidBy: toStr(body.txComplianceFeePaidBy),
      occupancyDates: toStr(body.occupancyDates),
      shortageAmount: toNum(body.shortageAmount),
      buyerBringToClosing: toNum(body.buyerBringToClosing),

      notes: toStr(body.notes),
      additionalComments: toStr(body.additionalComments),

      // Co-agent
      hasCoAgent: !!body.hasCoAgent,
      ...(body.hasCoAgent ? {
        coAgentId: toStr(body.coAgentId),
        coAgentDisplayName: toStr(body.coAgentDisplayName),
        coAgentRole: toStr(body.coAgentRole) || 'other',
        primaryAgentSplitPercent: toNum(body.primaryAgentSplitPercent),
        coAgentSplitPercent: toNum(body.coAgentSplitPercent),
      } : {}),

      // Legacy / reference
      transactionId: toStr(body.transactionId),
      assignedTcProfileId: null,

      submittedAt: now,
      updatedAt: now,
    };

    // A direct administrative submission tied to an existing transaction must
    // refresh the same TC workflow item instead of adding another queue row.
    const canonicalTransactionId = toStr(body.transactionId);
    if (canonicalTransactionId) {
      // An omitted assignment means "retain the current TC," not "unassign." A
      // caller may explicitly pass null when a deliberate unassignment is needed.
      const linkedIntakeData = { ...intakeData };
      if (body.assignedTcProfileId === undefined) delete linkedIntakeData.assignedTcProfileId;
      const queueUpdate = await reopenTcIntakeForTransaction(adminDb, {
        transactionId: canonicalTransactionId,
        preferredIntakeId: toStr(body.tcIntakeId),
        intake: linkedIntakeData,
        actorUid: decoded.uid,
        actorRole: 'staff',
        now,
      });
      return NextResponse.json({
        ok: true,
        intakeId: queueUpdate.id,
        transactionId: canonicalTransactionId,
        reopened: queueUpdate.reopened,
      }, { status: queueUpdate.created ? 201 : 200 });
    }

    const docRef = await adminDb.collection('tcIntakes').add(intakeData);

    // Create default checklist items as a subcollection
    const defaultChecklist = [
      { order: 1, label: 'Contract received & verified' },
      { order: 2, label: 'Earnest money deposit confirmed' },
      { order: 3, label: 'Title company ordered' },
      { order: 4, label: 'Home inspection scheduled' },
      { order: 5, label: 'Home inspection completed' },
      { order: 6, label: 'Appraisal ordered' },
      { order: 7, label: 'Appraisal received' },
      { order: 8, label: 'Loan approval received' },
      { order: 9, label: 'Title commitment reviewed' },
      { order: 10, label: 'Survey ordered/received' },
      { order: 11, label: 'HOA docs requested (if applicable)' },
      { order: 12, label: 'Final walkthrough scheduled' },
      { order: 13, label: 'Closing disclosure reviewed' },
      { order: 14, label: 'Closing documents prepared' },
      { order: 15, label: 'Commission disbursement verified' },
      { order: 16, label: 'File closed & archived' },
    ];

    const batch = adminDb.batch();
    for (const item of defaultChecklist) {
      const itemRef = adminDb
        .collection('tcIntakes')
        .doc(docRef.id)
        .collection('checklist')
        .doc(`item_${String(item.order).padStart(2, '0')}`);
      batch.set(itemRef, {
        order: item.order,
        label: item.label,
        completed: false,
        completedBy: null,
        completedAt: null,
      });
    }
    await batch.commit();

    return NextResponse.json({ ok: true, intakeId: docRef.id }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/admin/tc]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
