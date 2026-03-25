import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver'

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || ''
  if (!h.startsWith('Bearer ')) return null
  return h.slice('Bearer '.length).trim()
}

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status })
}

function toNumber(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toOptionalString(value: any): string | null {
  const s = String(value ?? '').trim()
  return s ? s : null
}

function toYearFromDates(closedDate: string | null, contractDate: string | null): number {
  const raw = closedDate || contractDate
  if (!raw) return new Date().getFullYear()
  const d = new Date(raw)
  if (isNaN(d.getTime())) return new Date().getFullYear()
  return d.getFullYear()
}

const ALLOWED_STATUS = new Set(['closed', 'pending', 'under_contract', 'cancelled'])
const ALLOWED_TYPES = new Set(['residential_sale', 'rental', 'commercial_lease', 'commercial_sale'])
const ALLOWED_SOURCES = new Set(['manual', 'ghl', 'import'])

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req)
    if (!token) return jsonError(401, 'Unauthorized: Missing token')

    const decoded = await adminAuth.verifyIdToken(token)
    const email = decoded.email || ''

    if (email !== 'jim@keatyrealestate.com') {
      return jsonError(403, 'Forbidden: Admin only')
    }

    const body = await req.json()

    const agentId = String(body.agentId || '').trim()
    const agentDisplayName = String(body.agentDisplayName || '').trim()
    const status = String(body.status || '').trim()
    const transactionType = String(body.transactionType || '').trim()
    const address = String(body.address || '').trim()
    const contractDate = toOptionalString(body.contractDate)
    const closedDate = toOptionalString(body.closedDate)
    const source = String(body.source || 'manual').trim()
    const commission = toNumber(body.commission)

    if (!agentId) return jsonError(400, 'agentId required')
    if (!agentDisplayName) return jsonError(400, 'agentDisplayName required')
    if (!ALLOWED_STATUS.has(status)) return jsonError(400, 'invalid status')
    if (!ALLOWED_TYPES.has(transactionType)) return jsonError(400, 'invalid transactionType')
    if (!address) return jsonError(400, 'address required')
    if (!ALLOWED_SOURCES.has(source)) return jsonError(400, 'invalid source')

    const year = toYearFromDates(closedDate, contractDate)
    const now = new Date()

    // If the admin already provided a manual splitSnapshot, use it directly
    // instead of running the tier-based calculation (which requires tiers to be configured)
    let splitSnapshot = body.splitSnapshot || null
    let creditSnapshot = body.creditSnapshot || null
    let agentType = body.agentType || 'independent'
    let calculationModel = body.calculationModel || 'manual'

    if (!splitSnapshot) {
      // No manual override — try the automatic tier-based calculation
      // If it fails (no tiers configured), fall back to a basic manual split
      try {
        const calculation = await resolveTransactionCalculation({
          agentId,
          agentDisplayName,
          commission,
        })
        splitSnapshot = calculation.splitSnapshot
        creditSnapshot = calculation.creditSnapshot
        agentType = calculation.agentType
        calculationModel = calculation.calculationModel
      } catch (calcErr: any) {
        console.warn('[API/transactions] Calculation failed, using manual fallback:', calcErr?.message)
        // Fallback: save with basic split (full commission as gross, no agent/company split calculated)
        splitSnapshot = {
          primaryTeamId: null, teamPlanId: null, memberPlanId: null,
          grossCommission: commission,
          agentSplitPercent: null, companySplitPercent: null,
          agentNetCommission: 0,
          leaderStructurePercent: null, leaderStructureGross: null,
          memberPercentOfLeaderSide: null, memberPaid: null,
          leaderRetainedAfterMember: null,
          companyRetained: 0,
        }
        calculationModel = 'manual_fallback'
      }
    } else {
      // Manual override provided
    }

    // Always ensure creditSnapshot exists
    if (!creditSnapshot) {
      creditSnapshot = {
        leaderboardAgentId: agentId,
        leaderboardAgentDisplayName: agentDisplayName,
        progressionMemberAgentId: agentId,
        progressionLeaderAgentId: null,
        progressionTeamId: null,
        progressionCompanyDollarCredit: commission,
      }
    }

    const payload: Record<string, any> = {
      agentId,
      agentDisplayName,
      agentType,
      calculationModel,

      status,
      transactionType,
      dealValue: toNumber(body.dealValue),
      address,
      contractDate,
      closedDate,
      year,
      source,
      clientName: toOptionalString(body.clientName),
      commission,
      brokerProfit: toNumber(body.brokerProfit),
      notes: toOptionalString(body.notes),

      splitSnapshot,
      creditSnapshot,

      // Pass through additional fields from the form
      ...(body.closingType ? { closingType: body.closingType } : {}),
      ...(body.dealType ? { dealType: body.dealType } : {}),
      ...(body.dealSource ? { dealSource: body.dealSource } : {}),
      ...(body.listPrice ? { listPrice: toNumber(body.listPrice) } : {}),
      ...(body.commissionPercent ? { commissionPercent: toNumber(body.commissionPercent) } : {}),
      ...(body.transactionFee ? { transactionFee: toNumber(body.transactionFee) } : {}),
      ...(body.earnestMoney ? { earnestMoney: toNumber(body.earnestMoney) } : {}),
      ...(body.listingDate ? { listingDate: body.listingDate } : {}),
      ...(body.optionExpiration ? { optionExpiration: body.optionExpiration } : {}),
      ...(body.inspectionDeadline ? { inspectionDeadline: body.inspectionDeadline } : {}),
      ...(body.surveyDeadline ? { surveyDeadline: body.surveyDeadline } : {}),
      ...(body.projectedCloseDate ? { projectedCloseDate: body.projectedCloseDate } : {}),
      // Client contact
      ...(body.clientEmail ? { clientEmail: body.clientEmail } : {}),
      ...(body.clientPhone ? { clientPhone: body.clientPhone } : {}),
      ...(body.clientNewAddress ? { clientNewAddress: body.clientNewAddress } : {}),
      ...(body.client2Name ? { client2Name: body.client2Name } : {}),
      ...(body.client2Email ? { client2Email: body.client2Email } : {}),
      ...(body.client2Phone ? { client2Phone: body.client2Phone } : {}),
      // Parties
      ...(body.otherAgentName ? { otherAgentName: body.otherAgentName } : {}),
      ...(body.otherAgentEmail ? { otherAgentEmail: body.otherAgentEmail } : {}),
      ...(body.otherAgentPhone ? { otherAgentPhone: body.otherAgentPhone } : {}),
      ...(body.otherBrokerage ? { otherBrokerage: body.otherBrokerage } : {}),
      ...(body.mortgageCompany ? { mortgageCompany: body.mortgageCompany } : {}),
      ...(body.loanOfficer ? { loanOfficer: body.loanOfficer } : {}),
      ...(body.loanOfficerEmail ? { loanOfficerEmail: body.loanOfficerEmail } : {}),
      ...(body.loanOfficerPhone ? { loanOfficerPhone: body.loanOfficerPhone } : {}),
      ...(body.titleCompany ? { titleCompany: body.titleCompany } : {}),
      ...(body.titleOfficer ? { titleOfficer: body.titleOfficer } : {}),
      ...(body.titleOfficerEmail ? { titleOfficerEmail: body.titleOfficerEmail } : {}),
      ...(body.titleOfficerPhone ? { titleOfficerPhone: body.titleOfficerPhone } : {}),

      createdAt: now,
      updatedAt: now,
    }

    const ref = await adminDb.collection('transactions').add(payload)

    return NextResponse.json({
      ok: true,
      id: ref.id,
      transaction: payload,
    })
  } catch (err: any) {
    console.error('[API/transactions]', err)

    if (
      err?.message?.includes('not found') ||
      err?.message?.includes('missing') ||
      err?.message?.includes('inactive') ||
      err?.message?.includes('No active')
    ) {
      return jsonError(400, 'Transaction calculation failed', {
        message: err?.message || 'Unable to resolve transaction splits',
      })
    }

    return jsonError(500, 'Internal Server Error', { message: err?.message })
  }
}
