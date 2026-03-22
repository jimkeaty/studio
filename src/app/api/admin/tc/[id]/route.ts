// GET + PATCH /api/admin/tc/[id] — admin reads or updates a single TC intake
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';

const ADMIN_EMAIL = 'jim@keatyrealestate.com';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function toNum(v: any): number {
  const n = Number(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function toOptStr(v: any): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

type Params = { params: Promise<{ id: string }> };

// ── GET single intake ───────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) return jsonError(403, 'Forbidden');

    const { id } = await params;
    const doc = await adminDb.collection('transactionIntakes').doc(id).get();
    if (!doc.exists) return jsonError(404, 'Intake not found');

    const data = doc.data()!;
    return NextResponse.json({
      ok: true,
      intake: {
        id: doc.id,
        ...data,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() ?? data.submittedAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? data.updatedAt,
        reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() ?? data.reviewedAt,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/admin/tc/[id]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── PATCH — update, approve, or reject ─────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) return jsonError(403, 'Forbidden');

    const { id } = await params;
    const body = await req.json();
    const action = String(body.action || '').trim(); // 'update' | 'approve' | 'reject' | 'in_review'

    const docRef = adminDb.collection('transactionIntakes').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return jsonError(404, 'Intake not found');

    const intake = doc.data()!;
    const now = new Date();

    // ── REJECT ──────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const rejectionReason = toOptStr(body.rejectionReason) || 'No reason provided';
      await docRef.update({
        status: 'rejected',
        rejectionReason,
        reviewedAt: now,
        reviewedBy: decoded.email,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, status: 'rejected' });
    }

    // ── IN_REVIEW ────────────────────────────────────────────────────────────
    if (action === 'in_review') {
      await docRef.update({
        status: 'in_review',
        reviewedAt: now,
        reviewedBy: decoded.email,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, status: 'in_review' });
    }

    // ── UPDATE (save edits without changing status) ──────────────────────────
    if (action === 'update') {
      const updates: Record<string, any> = { updatedAt: now };
      const editableFields = [
        'closingType', 'dealType', 'address', 'clientName',
        'listPrice', 'salePrice', 'commissionPercent', 'gci',
        'transactionFee', 'earnestMoney', 'brokerPct', 'brokerGci', 'agentPct', 'agentDollar',
        'listingDate', 'contractDate', 'optionExpiration', 'inspectionDeadline',
        'surveyDeadline', 'projectedCloseDate', 'closedDate',
        'dealSource', 'mortgageCompany', 'loanOfficer', 'titleCompany', 'titleOfficer',
        'otherAgentName', 'otherBrokerage', 'notes',
      ];
      for (const field of editableFields) {
        if (field in body) {
          const val = body[field];
          updates[field] = val === '' || val === null ? null : val;
        }
      }
      await docRef.update(updates);
      return NextResponse.json({ ok: true, status: 'updated' });
    }

    // ── APPROVE → create transaction ─────────────────────────────────────────
    if (action === 'approve') {
      if (intake.status === 'approved') {
        return jsonError(400, 'Intake is already approved');
      }

      const agentId = String(intake.agentId || '').trim();
      const agentDisplayName = String(intake.agentDisplayName || '').trim();

      if (!agentId) return jsonError(400, 'Intake has no agentId — cannot approve');

      // Determine GCI for split calculation
      const rawGci = toNum(intake.gci);
      const rawAgentDollar = intake.agentDollar ? toNum(intake.agentDollar) : null;
      const rawBrokerGci = intake.brokerGci ? toNum(intake.brokerGci) : null;

      let splitSnapshot: Record<string, any>;
      let creditSnapshot: Record<string, any>;
      let agentType = 'independent';
      let calculationModel = 'individual';

      if (rawAgentDollar !== null && rawAgentDollar > 0) {
        // ── Historical / manual override: use supplied numbers directly ──────
        const grossCommission = rawGci > 0 ? rawGci : 0;
        const companyRetained =
          rawBrokerGci !== null && rawBrokerGci > 0
            ? rawBrokerGci
            : Math.max(0, grossCommission - rawAgentDollar);

        splitSnapshot = {
          primaryTeamId: null,
          teamPlanId: null,
          memberPlanId: null,
          grossCommission,
          agentSplitPercent: intake.agentPct ? toNum(intake.agentPct) : null,
          companySplitPercent: intake.brokerPct ? toNum(intake.brokerPct) : null,
          agentNetCommission: rawAgentDollar,
          leaderStructurePercent: null,
          leaderStructureGross: null,
          memberPercentOfLeaderSide: null,
          memberPaid: null,
          leaderRetainedAfterMember: null,
          companyRetained,
        };

        creditSnapshot = {
          leaderboardAgentId: agentId,
          leaderboardAgentDisplayName: agentDisplayName,
          progressionMemberAgentId: null,
          progressionLeaderAgentId: null,
          progressionTeamId: null,
          progressionCompanyDollarCredit: companyRetained,
        };
      } else {
        // ── Live calculation via team resolver ───────────────────────────────
        const commission = rawGci;
        const calc = await resolveTransactionCalculation({ agentId, agentDisplayName, commission });
        splitSnapshot = calc.splitSnapshot as any;
        creditSnapshot = calc.creditSnapshot as any;
        agentType = calc.agentType;
        calculationModel = calc.calculationModel;
      }

      // Determine year from dates
      const closedDate = toOptStr(intake.closedDate);
      const contractDate = toOptStr(intake.contractDate);
      const dateForYear = closedDate || contractDate || new Date().toISOString();
      const year = new Date(dateForYear).getFullYear() || new Date().getFullYear();

      // Map deal type → transactionType (for existing schema compatibility)
      const dealType = toOptStr(intake.dealType) || 'residential_sale';
      // Map extended types back to core types for backward compat
      const txTypeMap: Record<string, string> = {
        residential_sale: 'residential_sale',
        residential_lease: 'rental',
        land: 'residential_sale',
        commercial_sale: 'commercial_sale',
        commercial_lease: 'commercial_lease',
      };
      const transactionType = txTypeMap[dealType] || 'residential_sale';

      const txPayload: Record<string, any> = {
        agentId,
        agentDisplayName,
        agentType,
        calculationModel,

        status: closedDate ? 'closed' : 'pending',
        transactionType,
        closingType: toOptStr(intake.closingType),
        dealType,

        address: intake.address,
        clientName: toOptStr(intake.clientName),
        dealSource: toOptStr(intake.dealSource),

        listPrice: intake.listPrice ?? null,
        dealValue: intake.salePrice ? toNum(intake.salePrice) : intake.listPrice ? toNum(intake.listPrice) : null,
        commissionPercent: intake.commissionPercent ?? null,
        transactionFee: intake.transactionFee ?? null,
        earnestMoney: intake.earnestMoney ?? null,

        listingDate: toOptStr(intake.listingDate),
        contractDate: toOptStr(intake.contractDate),
        optionExpiration: toOptStr(intake.optionExpiration),
        inspectionDeadline: toOptStr(intake.inspectionDeadline),
        surveyDeadline: toOptStr(intake.surveyDeadline),
        projectedCloseDate: toOptStr(intake.projectedCloseDate),
        closedDate,

        mortgageCompany: toOptStr(intake.mortgageCompany),
        loanOfficer: toOptStr(intake.loanOfficer),
        titleCompany: toOptStr(intake.titleCompany),
        titleOfficer: toOptStr(intake.titleOfficer),
        otherAgentName: toOptStr(intake.otherAgentName),
        otherBrokerage: toOptStr(intake.otherBrokerage),

        notes: toOptStr(intake.notes),

        splitSnapshot,
        creditSnapshot,

        year,
        source: 'tc_form',
        intakeId: id,
        createdAt: now,
        updatedAt: now,
      };

      const txRef = await adminDb.collection('transactions').add(txPayload);

      // Mark intake approved
      await docRef.update({
        status: 'approved',
        approvedTransactionId: txRef.id,
        reviewedAt: now,
        reviewedBy: decoded.email,
        updatedAt: now,
      });

      return NextResponse.json({
        ok: true,
        status: 'approved',
        transactionId: txRef.id,
      });
    }

    return jsonError(400, `Unknown action: "${action}". Use: update, approve, reject, in_review`);
  } catch (err: any) {
    console.error('[PATCH /api/admin/tc/[id]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
