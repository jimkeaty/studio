// GET /api/admin/transactions/export
// Returns a CSV file of all transactions (admin-only).
// Query params:
//   ?agentId=<id>   — filter to a single agent (optional)
//   ?year=<year>    — filter to a calendar year (optional)
//   ?status=<s>     — filter to a status (optional)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

// ── Helpers ────────────────────────────────────────────────────────────

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const decoded = await adminAuth.verifyIdToken(token);
  if (!(await isAdminLike(decoded.uid))) return null;
  return decoded;
}

function toStr(val: any): string {
  if (val == null) return '';
  if (typeof val?.toDate === 'function') return val.toDate().toISOString().slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val);
}

function toNum(val: any): string {
  const n = Number(val ?? '');
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

/** Escape a CSV cell value — wrap in quotes if it contains comma, quote, or newline */
function csvCell(val: any): string {
  const s = toStr(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(',');
}

// ── CSV column definitions ─────────────────────────────────────────────

const HEADERS = [
  'ID',
  'Status',
  'Address',
  'Agent',
  'Agent ID',
  'Closing Type',
  'Transaction Type',
  'Deal Source',
  'Contract Date',
  'Closed Date',
  'Projected Close Date',
  'Listing Date',
  'Option Expiration',
  'Inspection Deadline',
  'Survey Deadline',
  'Loan Application Deadline',
  'Appraisal Deadline',
  'Title Deadline',
  'Final Loan Commitment Deadline',
  'Year',
  'List Price',
  'Sale Price',
  'Deal Value',
  'Commission %',
  'Gross Commission',
  'Agent Net Commission',
  'Company Retained',
  'Transaction Fee',
  'Earnest Money',
  'Buyer Closing Cost Total',
  'Buyer Closing Cost Agent Commission',
  'Buyer Closing Cost TX Fee',
  'Buyer Closing Cost Other',
  'Seller Paying Listing Agent',
  'Seller Paying Buyer Agent',
  'Client Name',
  'Client Type',
  'Client New Address',
  'Buyer Name',
  'Buyer Email',
  'Buyer Phone',
  'Buyer 2 Name',
  'Buyer 2 Email',
  'Buyer 2 Phone',
  'Seller Name',
  'Seller Email',
  'Seller Phone',
  'Seller 2 Name',
  'Seller 2 Email',
  'Seller 2 Phone',
  'Cooperating Agent Name',
  'Cooperating Agent Email',
  'Cooperating Agent Phone',
  'Cooperating Brokerage',
  'Mortgage Company',
  'Loan Officer',
  'Loan Officer Email',
  'Loan Officer Phone',
  'Title Company',
  'Title Officer',
  'Title Officer Email',
  'Title Officer Phone',
  'Inspection Types',
  'Warranty At Closing',
  'Warranty Paid By',
  'TX Compliance Fee',
  'TX Compliance Fee Amount',
  'TX Compliance Fee Paid By',
  'Occupancy Agreement',
  'Occupancy Dates',
  'Shortage In Commission',
  'Shortage Amount',
  'Buyer Bring To Closing',
  'Notes',
  'Additional Comments',
  'Source',
  'Created At',
  'Updated At',
];

function txToRow(id: string, t: any): string {
  const cells = [
    id,
    t.status,
    t.address,
    t.agentDisplayName,
    t.agentId,
    t.closingType,
    t.transactionType || t.dealType,
    t.dealSource,
    t.contractDate,
    t.closedDate || t.closingDate,
    t.projectedCloseDate,
    t.listingDate,
    t.optionExpiration,
    t.inspectionDeadline,
    t.surveyDeadline,
    t.loanApplicationDeadline,
    t.appraisalDeadline,
    t.titleDeadline,
    t.finalLoanCommitmentDeadline,
    t.year,
    toNum(t.listPrice),
    toNum(t.salePrice),
    toNum(t.dealValue),
    toNum(t.commissionPercent),
    toNum(t.splitSnapshot?.grossCommission ?? t.commission),
    toNum(t.splitSnapshot?.agentNetCommission ?? t.agentNetCommission ?? t.netCommission),
    toNum(t.splitSnapshot?.companyRetained),
    toNum(t.transactionFee),
    toNum(t.earnestMoney),
    toNum(t.buyerClosingCostTotal),
    toNum(t.buyerClosingCostAgentCommission),
    toNum(t.buyerClosingCostTxFee),
    toNum(t.buyerClosingCostOther),
    toNum(t.sellerPayingListingAgent),
    toNum(t.sellerPayingBuyerAgent),
    t.clientName,
    t.clientType,
    t.clientNewAddress,
    t.buyerName,
    t.buyerEmail,
    t.buyerPhone,
    t.buyer2Name,
    t.buyer2Email,
    t.buyer2Phone,
    t.sellerName,
    t.sellerEmail,
    t.sellerPhone,
    t.seller2Name,
    t.seller2Email,
    t.seller2Phone,
    t.otherAgentName,
    t.otherAgentEmail,
    t.otherAgentPhone,
    t.otherBrokerage,
    t.mortgageCompany,
    t.loanOfficer,
    t.loanOfficerEmail,
    t.loanOfficerPhone,
    t.titleCompany,
    t.titleOfficer,
    t.titleOfficerEmail,
    t.titleOfficerPhone,
    Array.isArray(t.inspectionTypes) ? t.inspectionTypes.join('; ') : toStr(t.inspectionTypes),
    t.warrantyAtClosing,
    t.warrantyPaidBy,
    t.txComplianceFee,
    toNum(t.txComplianceFeeAmount),
    t.txComplianceFeePaidBy,
    t.occupancyAgreement,
    t.occupancyDates,
    t.shortageInCommission,
    toNum(t.shortageAmount),
    toNum(t.buyerBringToClosing),
    t.notes,
    t.additionalComments,
    t.source || 'manual',
    toStr(t.createdAt),
    toStr(t.updatedAt),
  ];
  return csvRow(cells);
}

// ── Route handler ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const { searchParams } = new URL(req.url);
    const agentIdFilter = searchParams.get('agentId') || '';
    const yearFilter = searchParams.get('year') || '';
    const statusFilter = searchParams.get('status') || '';

    // Build Firestore query — start with the full collection
    let query: FirebaseFirestore.Query = adminDb.collection('transactions');

    // Apply server-side filters where possible (Firestore only supports equality filters
    // without composite indexes, so we apply agentId and year server-side and status client-side)
    if (agentIdFilter) {
      query = query.where('agentId', '==', agentIdFilter);
    }
    if (yearFilter) {
      const y = Number(yearFilter);
      if (Number.isFinite(y) && y > 0) {
        query = query.where('year', '==', y);
      }
    }

    const snap = await query.get();

    // Apply remaining filters client-side
    const rows: string[] = [HEADERS.join(',')];
    for (const doc of snap.docs) {
      const t = doc.data() || {};
      if (statusFilter && t.status !== statusFilter) continue;
      rows.push(txToRow(doc.id, t));
    }

    // Build filename
    const parts = ['transactions'];
    if (agentIdFilter) parts.push(`agent-${agentIdFilter}`);
    if (yearFilter) parts.push(yearFilter);
    if (statusFilter) parts.push(statusFilter);
    const filename = `${parts.join('_')}.csv`;

    const csv = rows.join('\r\n') + '\r\n';

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('[api/admin/transactions/export GET]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
