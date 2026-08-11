import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver'
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup'
import { isAdminLike } from '@/lib/auth/staffAccess'
import { normalizeDealSource } from '@/lib/normalizeDealSource'
import { buildCoAgentAllocationUpdate } from '@/lib/transactions/syncCoAgentAllocations'

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

const ALLOWED_STATUS = new Set(['active', 'closed', 'pending', 'cancelled', 'temp_off_market'])
const ALLOWED_TYPES = new Set(['residential_sale', 'rental', 'commercial_lease', 'commercial_sale'])
const ALLOWED_SOURCES = new Set(['manual', 'ghl', 'import'])

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req)
    if (!token) return jsonError(401, 'Unauthorized: Missing token')

    const decoded = await adminAuth.verifyIdToken(token)

    const isAdmin = await isAdminLike(decoded.uid)
    if (!isAdmin) {
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
          transactionDate: closedDate || contractDate,
        })
        splitSnapshot = calculation.splitSnapshot
        creditSnapshot = calculation.creditSnapshot
        agentType = calculation.agentType
        calculationModel = calculation.calculationModel
        // ── Agent-paid compliance fee deduction ───────────────────────────────
        // When the agent is paying the compliance fee out of their own commission,
        // subtract it from agentNetCommission so the stored net is accurate.
        {
          const _txFeeAmt = Number(body.txComplianceFeeAmount) || 0
          const _txFeePaidBy = String(body.txComplianceFeePaidBy || '').toLowerCase().trim()
          if (body.txComplianceFee === 'yes' && _txFeeAmt > 0 && _txFeePaidBy === 'agent') {
            const _rawNet = Number((splitSnapshot as any).agentNetCommission) || 0
            ;(splitSnapshot as any).agentNetCommission = Number(Math.max(0, _rawNet - _txFeeAmt).toFixed(2))
            ;(splitSnapshot as any).agentFeeDeduction = _txFeeAmt
          }
        }
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

    // ── Co-Agent Calculation ─────────────────────────────────────────────────
    // If a co-agent is present, the side gross commission is split first by
    // the agreed percentages, then each agent's own commission structure is
    // applied independently to their respective share.
    const hasCoAgent = !!body.hasCoAgent
    let coAgentData: Record<string, any> | null = null

    if (hasCoAgent) {
      const coAgentId = String(body.coAgentId || '').trim()
      const coAgentDisplayName = String(body.coAgentDisplayName || '').trim()
      const coAgentRole = String(body.coAgentRole || 'other').trim()
      const primarySplitPct = toNumber(body.primaryAgentSplitPercent)
      const coSplitPct = toNumber(body.coAgentSplitPercent)

      if (coAgentId && coAgentDisplayName && primarySplitPct + coSplitPct === 100) {
        // Step 1: Deduct outbound referral fee OFF THE TOP before splitting between agents.
        // The referral fee is paid to an outside broker/relocation company from total GCI.
        // All agent/broker splits are calculated on the net-after-referral amount.
        const _refFeeData = body.outboundReferralFee as Record<string, any> | null | undefined
        const _refPct = _refFeeData ? Number(_refFeeData.referralPercent ?? 0) : 0
        const _refDollarOverride = _refFeeData ? Number(_refFeeData.referralDollar ?? 0) : 0
        const _refFeeDollar = _refPct > 0
          ? (_refDollarOverride > 0 ? _refDollarOverride : Number((commission * (_refPct / 100)).toFixed(2)))
          : 0
        const _netAfterReferral = Number(Math.max(0, commission - _refFeeDollar).toFixed(2))

        // Step 2: Split the POST-REFERRAL net between primary and co-agent
        const primaryShare = Number((_netAfterReferral * (primarySplitPct / 100)).toFixed(2))
        const coShare = Number((_netAfterReferral * (coSplitPct / 100)).toFixed(2))

        // Step 3: Re-run primary agent calculation on their reduced share
        // (referralFeePercent: null — deduction already applied in primaryShare)
        try {
          const primaryCalc = await resolveTransactionCalculation({
            agentId,
            agentDisplayName,
            commission: primaryShare,
            transactionDate: closedDate || contractDate,
            referralFeePercent: null,
          })
          splitSnapshot = primaryCalc.splitSnapshot
          creditSnapshot = primaryCalc.creditSnapshot
          agentType = primaryCalc.agentType
          calculationModel = primaryCalc.calculationModel
        } catch {
          // Keep existing splitSnapshot if recalc fails
        }

        // Step 4: Run co-agent calculation on their share
        // (referralFeePercent: null — deduction already applied in coShare)
        let coSplitSnapshot: any = null
        let coCreditSnapshot: any = null
        try {
          const coCalc = await resolveTransactionCalculation({
            agentId: coAgentId,
            agentDisplayName: coAgentDisplayName,
            commission: coShare,
            transactionDate: closedDate || contractDate,
            referralFeePercent: null,
          })
          coSplitSnapshot = coCalc.splitSnapshot
          coCreditSnapshot = coCalc.creditSnapshot
        } catch {
          coSplitSnapshot = {
            primaryTeamId: null, teamPlanId: null, memberPlanId: null,
            grossCommission: coShare,
            agentSplitPercent: null, companySplitPercent: null,
            agentNetCommission: 0,
            leaderStructurePercent: null, leaderStructureGross: null,
            memberPercentOfLeaderSide: null, memberPaid: null,
            leaderRetainedAfterMember: null,
            companyRetained: 0,
          }
        }
        if (!coCreditSnapshot) {
          coCreditSnapshot = {
            leaderboardAgentId: coAgentId,
            leaderboardAgentDisplayName: coAgentDisplayName,
            progressionMemberAgentId: coAgentId,
            progressionLeaderAgentId: null,
            progressionTeamId: null,
            progressionCompanyDollarCredit: coShare,
          }
        }

        // Step 4: Store co-agent data alongside the transaction
        coAgentData = {
          agentId: coAgentId,
          agentDisplayName: coAgentDisplayName,
          role: coAgentRole,
          splitPercent: coSplitPct,
          sideCredit: coSplitPct / 100,
          splitSnapshot: coSplitSnapshot,
          creditSnapshot: coCreditSnapshot,
        }

        // Update primary agent's side credit fraction
        // (stored on the top-level transaction for rollup use)
      }
    }

    const payload: Record<string, any> = {
      agentId,
      agentDisplayName,
      agentType,
      calculationModel,

      status,
      transactionType,
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

      // Co-agent fields
      hasCoAgent,
      ...(hasCoAgent && coAgentData ? {
        primaryAgentSplitPercent: toNumber(body.primaryAgentSplitPercent),
        primaryAgentSideCredit: toNumber(body.primaryAgentSplitPercent) / 100,
        coAgent: coAgentData,
      } : {}),

      // Pass through additional fields from the form
      ...(body.closingType ? { closingType: body.closingType } : {}),
      ...(body.dealType ? { dealType: body.dealType } : {}),
      ...(body.dealSource ? { dealSource: normalizeDealSource(body.dealSource) } : {}),
      ...(body.listPrice ? { listPrice: toNumber(body.listPrice) } : {}),
      ...(body.commissionPercent ? { commissionPercent: toNumber(body.commissionPercent) } : {}),
      ...(body.commissionBasePrice ? { commissionBasePrice: toNumber(body.commissionBasePrice) } : {}),
      ...(body.transactionFee ? { transactionFee: toNumber(body.transactionFee) } : {}),
      ...(body.earnestMoney ? { earnestMoney: toNumber(body.earnestMoney) } : {}),
      ...(body.depositHolder ? { depositHolder: body.depositHolder } : {}),
      ...(body.depositHolderOther ? { depositHolderOther: body.depositHolderOther } : {}),
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
      // TC Working File fields
      ...(body.tcWorking ? { tcWorking: body.tcWorking } : {}),
      ...(body.clientType ? { clientType: body.clientType } : {}),
      // Buyer info
      ...(body.buyerName ? { buyerName: body.buyerName } : {}),
      ...(body.buyerEmail ? { buyerEmail: body.buyerEmail } : {}),
      ...(body.buyerPhone ? { buyerPhone: body.buyerPhone } : {}),
      ...(body.buyer2Name ? { buyer2Name: body.buyer2Name } : {}),
      ...(body.buyer2Email ? { buyer2Email: body.buyer2Email } : {}),
      ...(body.buyer2Phone ? { buyer2Phone: body.buyer2Phone } : {}),
      // Seller info
      ...(body.sellerName ? { sellerName: body.sellerName } : {}),
      ...(body.sellerEmail ? { sellerEmail: body.sellerEmail } : {}),
      ...(body.sellerPhone ? { sellerPhone: body.sellerPhone } : {}),
      ...(body.seller2Name ? { seller2Name: body.seller2Name } : {}),
      ...(body.seller2Email ? { seller2Email: body.seller2Email } : {}),
      ...(body.seller2Phone ? { seller2Phone: body.seller2Phone } : {}),
      // Lender office
      ...(body.lenderOffice ? { lenderOffice: body.lenderOffice } : {}),
      // Title extras
      ...(body.titleAttorney ? { titleAttorney: body.titleAttorney } : {}),
      ...(body.titleOffice ? { titleOffice: body.titleOffice } : {}),
      // Inspections
      ...(body.inspectionOrdered ? { inspectionOrdered: body.inspectionOrdered } : {}),
      ...(body.targetInspectionDate ? { targetInspectionDate: body.targetInspectionDate } : {}),
      ...(body.inspectionTypes && Array.isArray(body.inspectionTypes) && body.inspectionTypes.length > 0 ? { inspectionTypes: body.inspectionTypes } : {}),
      ...(body.tcScheduleInspections ? { tcScheduleInspections: body.tcScheduleInspections } : {}),
      ...(body.tcScheduleInspectionsOther ? { tcScheduleInspectionsOther: body.tcScheduleInspectionsOther } : {}),
      ...(body.inspectorName ? { inspectorName: body.inspectorName } : {}),
      // Commission paid by seller
      ...(body.sellerPayingListingAgent ? { sellerPayingListingAgent: toNumber(body.sellerPayingListingAgent) } : {}),
      ...(body.sellerPayingListingAgentUnknown !== undefined ? { sellerPayingListingAgentUnknown: !!body.sellerPayingListingAgentUnknown } : {}),
      ...(body.sellerPayingBuyerAgent ? { sellerPayingBuyerAgent: toNumber(body.sellerPayingBuyerAgent) } : {}),
      // Buyer closing cost paid by seller
      ...(body.buyerClosingCostTotal ? { buyerClosingCostTotal: toNumber(body.buyerClosingCostTotal) } : {}),
      ...(body.buyerClosingCostAgentCommission ? { buyerClosingCostAgentCommission: toNumber(body.buyerClosingCostAgentCommission) } : {}),
      ...(body.buyerClosingCostTxFee ? { buyerClosingCostTxFee: toNumber(body.buyerClosingCostTxFee) } : {}),
      ...(body.buyerClosingCostOther ? { buyerClosingCostOther: toNumber(body.buyerClosingCostOther) } : {}),
      // Additional info
      ...(body.warrantyAtClosing ? { warrantyAtClosing: body.warrantyAtClosing } : {}),
      ...(body.warrantyPaidBy ? { warrantyPaidBy: body.warrantyPaidBy } : {}),
      ...(body.txComplianceFee ? { txComplianceFee: body.txComplianceFee } : {}),
      ...(body.txComplianceFeeAmount ? { txComplianceFeeAmount: toNumber(body.txComplianceFeeAmount) } : {}),
      ...(body.txComplianceFeePaidBy ? { txComplianceFeePaidBy: body.txComplianceFeePaidBy } : {}),
      ...(body.txComplianceFeeAgentAllocation ? { txComplianceFeeAgentAllocation: body.txComplianceFeeAgentAllocation } : {}),
      ...(body.txComplianceFeePrimaryAgentAmount !== undefined ? { txComplianceFeePrimaryAgentAmount: toNumber(body.txComplianceFeePrimaryAgentAmount) } : {}),
      ...(body.txComplianceFeeCoAgentAmount !== undefined ? { txComplianceFeeCoAgentAmount: toNumber(body.txComplianceFeeCoAgentAmount) } : {}),
      ...(body.occupancyAgreement ? { occupancyAgreement: body.occupancyAgreement } : {}),
      ...(body.occupancyDates ? { occupancyDates: body.occupancyDates } : {}),
      ...(body.shortageInCommission ? { shortageInCommission: body.shortageInCommission } : {}),
      ...(body.shortageAmount ? { shortageAmount: toNumber(body.shortageAmount) } : {}),
      ...(body.buyerBringToClosing ? { buyerBringToClosing: toNumber(body.buyerBringToClosing) } : {}),
      ...(body.additionalComments ? { additionalComments: body.additionalComments } : {}),

      createdAt: now,
      updatedAt: now,
    }

     const ref = await adminDb.collection('transactions').add(payload)

    // Co-agent accounting stays on this original shared file—even when closed.
    if (hasCoAgent && coAgentData?.agentId) {
      try {
        await ref.update(await buildCoAgentAllocationUpdate(adminDb, { ...payload, id: ref.id }))
      } catch (allocationErr: any) {
        console.warn('[API/transactions] Co-agent allocation initialization failed (non-fatal):', allocationErr?.message)
      }
    }

    // Rebuild the agent's year rollup so leaderboards stay in sync
    try {
      await rebuildAgentRollup(adminDb, agentId, year)
      if (coAgentData?.agentId) await rebuildAgentRollup(adminDb, coAgentData.agentId, year)
    } catch (rollupErr: any) {
      console.warn('[API/transactions] Rollup rebuild failed (non-fatal):', rollupErr?.message)
    }

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
