// POST /api/tc — any authenticated agent submits a new TC intake
// ARCHITECTURE: transactions is the single source of truth.
// All form fields are written to the transactions document.
// tcIntakes is a lightweight workflow-status wrapper pointing at the transaction.
// staffQueue is a lightweight action-queue pointer pointing at the transaction.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getTcUids, getStaffUidsForAgent, getAllStaffUids } from '@/lib/notifications/getRecipientUids';
import { isAdminLike } from '@/lib/auth/staffAccess';

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
function toBool(v: any): boolean {
  return v === true || v === 'true' || v === 'yes';
}
function toArr(v: any): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

const VALID_CLOSING_TYPES = new Set(['buyer', 'listing', 'referral', 'dual']);
const VALID_DEAL_TYPES = new Set([
  'residential_sale', 'residential_lease', 'land',
  'commercial_listing', 'commercial_sale', 'commercial_lease',
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
    const closingType = toStr(body.closingType);
    if (!closingType || !VALID_CLOSING_TYPES.has(closingType)) {
      return jsonError(400, 'closingType must be: buyer, listing, dual, or referral');
    }
    const clientName =
      toStr(body.clientName) ||
      toStr(body.sellerName) ||
      toStr(body.buyerName) ||
      '';
    if (!clientName && closingType !== 'listing' && closingType !== 'referral') {
      return jsonError(400, 'clientName is required');
    }
    const contractDate = toStr(body.contractDate);
    const dealType = toStr(body.dealType) || 'residential_sale';
    if (!VALID_DEAL_TYPES.has(dealType)) {
      return jsonError(400, 'invalid dealType');
    }

    // Agent info
    let agentId = toStr(body.agentId) || uid;
    const agentDisplayName = toStr(body.agentDisplayName) || toStr(decoded.name) || email;
    try {
      const directSnap = await adminDb.collection('agentProfiles').doc(agentId).get();
      if (!directSnap.exists) {
        const byUidSnap = await adminDb
          .collection('agentProfiles')
          .where('firebaseUid', '==', agentId)
          .limit(1)
          .get();
        if (!byUidSnap.empty) agentId = byUidSnap.docs[0].id;
      }
    } catch { /* non-fatal */ }

    const isAdmin = await isAdminLike(uid);
    const now = new Date();
    const workingWithTc = toBool(body.workingWithTc) || body.tcWorking === 'yes';
    const isListingType = closingType === 'listing' || closingType === 'dual';

    // Commission split snapshot
    const _rawAgentNet = toNum(body.agentDollar) || 0;
    const _txFeeAmt = toNum(body.txComplianceFeeAmount) || 0;
    const _txFeePaidBy = String(body.txComplianceFeePaidBy || '').toLowerCase().trim();
    const _agentPaysFee = body.txComplianceFee === 'yes' && _txFeeAmt > 0 && _txFeePaidBy === 'agent';
    const _expectedPostFee = _agentPaysFee ? Number(Math.max(0, _rawAgentNet - _txFeeAmt).toFixed(2)) : _rawAgentNet;
    const _agentNetCommission = _agentPaysFee && Math.abs(_rawAgentNet - _expectedPostFee) > 0.01
      ? _expectedPostFee
      : _rawAgentNet;
    const splitSnapshot = (toNum(body.agentDollar) || toNum(body.brokerGci))
      ? {
          grossCommission: toNum(body.gci) || toNum(body.commission) || null,
          agentNetCommission: _agentNetCommission || null,
          companyRetained: toNum(body.brokerGci) || null,
          ...(_agentPaysFee ? { agentFeeDeduction: _txFeeAmt } : {}),
        }
      : null;

    // Documents
    const documents = Array.isArray(body.documents)
      ? body.documents
          .filter((d: any) => d && typeof d.url === 'string' && typeof d.name === 'string')
          .map((d: any) => ({
            name: String(d.name).slice(0, 255),
            url: String(d.url),
            storagePath: String(d.storagePath || ''),
            uploadedAt: String(d.uploadedAt || now.toISOString()),
          }))
      : [];

    // ══════════════════════════════════════════════════════════════════════
    // SINGLE SOURCE OF TRUTH: The transactions document holds EVERY field.
    // TC queue, staff queue, and agent ledger all read from this one document.
    // ══════════════════════════════════════════════════════════════════════
    const txDoc: Record<string, any> = {
      // Identity & routing
      agentId,
      agentDisplayName,
      submittedByUid: uid,
      submittedByEmail: email,
      address,
      propertyAddress: address,
      status: toStr(body.status) || 'active',
      closingType,
      transactionType: dealType,
      dealType,
      dealSource: toStr(body.dealSource) || null,
      workingWithTc,
      tcWorking: body.tcWorking || null,
      tcStatus: workingWithTc ? 'submitted' : null,
      tcAssignedTo: null,
      tcSubmittedAt: workingWithTc ? now : null,

      // Property & listing details
      mlsNumber: toStr(body.mlsNumber) || null,
      listPrice: toNum(body.listPrice),
      salePrice: toNum(body.salePrice),
      listingDate: toStr(body.listingDate) || null,
      listingExpirationDate: toStr(body.listingExpirationDate) || null,
      mlsDescription: toStr(body.mlsDescription) || null,

      // Key dates
      contractDate: contractDate || null,
      closingDate: toStr(body.closedDate) || toStr(body.closingDate) || null,
      closedDate: toStr(body.closedDate) || null,
      projectedCloseDate: toStr(body.projectedCloseDate) || null,
      optionExpiration: toStr(body.optionExpiration) || null,
      inspectionDeadline: toStr(body.inspectionDeadline) || null,
      appraisalDeadline: toStr(body.appraisalDeadline) || null,
      surveyDeadline: toStr(body.surveyDeadline) || null,
      titleDeadline: toStr(body.titleDeadline) || null,
      loanApplicationDeadline: toStr(body.loanApplicationDeadline) || null,
      finalLoanCommitmentDeadline: toStr(body.finalLoanCommitmentDeadline) || null,

      // Client contacts
      clientType: toStr(body.clientType) || null,
      clientName,
      clientEmail: toStr(body.clientEmail) || null,
      clientPhone: toStr(body.clientPhone) || null,
      clientNewAddress: toStr(body.clientNewAddress) || null,
      client2Name: toStr(body.client2Name) || null,
      client2Email: toStr(body.client2Email) || null,
      client2Phone: toStr(body.client2Phone) || null,

      // Seller contacts
      sellerName: toStr(body.sellerName) || null,
      sellerEmail: toStr(body.sellerEmail) || null,
      sellerPhone: toStr(body.sellerPhone) || null,
      seller2Name: toStr(body.seller2Name) || null,
      seller2Email: toStr(body.seller2Email) || null,
      seller2Phone: toStr(body.seller2Phone) || null,
      seller3Name: toStr(body.seller3Name) || null,
      seller3Email: toStr(body.seller3Email) || null,
      seller3Phone: toStr(body.seller3Phone) || null,
      seller4Name: toStr(body.seller4Name) || null,
      seller4Email: toStr(body.seller4Email) || null,
      seller4Phone: toStr(body.seller4Phone) || null,

      // Buyer contacts
      buyerName: toStr(body.buyerName) || null,
      buyerEmail: toStr(body.buyerEmail) || null,
      buyerPhone: toStr(body.buyerPhone) || null,
      buyer2Name: toStr(body.buyer2Name) || null,
      buyer2Email: toStr(body.buyer2Email) || null,
      buyer2Phone: toStr(body.buyer2Phone) || null,
      buyer3Name: toStr(body.buyer3Name) || null,
      buyer3Email: toStr(body.buyer3Email) || null,
      buyer3Phone: toStr(body.buyer3Phone) || null,
      buyer4Name: toStr(body.buyer4Name) || null,
      buyer4Email: toStr(body.buyer4Email) || null,
      buyer4Phone: toStr(body.buyer4Phone) || null,

      // Other agent / cooperating brokerage
      otherAgentName: toStr(body.otherAgentName) || null,
      otherAgentEmail: toStr(body.otherAgentEmail) || null,
      otherAgentPhone: toStr(body.otherAgentPhone) || null,
      otherAgentBrokerage: toStr(body.otherBrokerage) || null,
      otherBrokerage: toStr(body.otherBrokerage) || null,

      // Lender / mortgage
      mortgageCompany: toStr(body.mortgageCompany) || null,
      loanOfficer: toStr(body.loanOfficer) || null,
      loanOfficerEmail: toStr(body.loanOfficerEmail) || null,
      loanOfficerPhone: toStr(body.loanOfficerPhone) || null,
      lenderOffice: toStr(body.lenderOffice) || null,

      // Title company
      titleCompany: toStr(body.titleCompany) || null,
      titleOfficer: toStr(body.titleOfficer) || null,
      titleOfficerEmail: toStr(body.titleOfficerEmail) || null,
      titleOfficerPhone: toStr(body.titleOfficerPhone) || null,
      titleAttorney: toStr(body.titleAttorney) || null,
      titleOffice: toStr(body.titleOffice) || null,

      // Commission (broker fields hidden from agent in UI layer only)
      commission: toNum(body.gci) || toNum(body.commission) || null,
      gci: toNum(body.gci) || toNum(body.commission) || null,
      commissionPercent: toNum(body.commissionPercent) || null,
      commissionBasePrice: toNum(body.commissionBasePrice) || null,
      commissionMode: toStr(body.commissionMode) || null,
      transactionFee: toNum(body.transactionFee) || null,
      agentDollar: toNum(body.agentDollar) || null,
      agentPct: toNum(body.agentPct) || null,
      brokerGci: toNum(body.brokerGci) || null,
      brokerPct: toNum(body.brokerPct) || null,
      ...(splitSnapshot ? { splitSnapshot } : {}),
      sellerPayingListingAgent: toNum(body.sellerPayingListingAgent) || null,
      sellerPayingListingAgentUnknown: toBool(body.sellerPayingListingAgentUnknown),
      sellerPayingBuyerAgent: toNum(body.sellerPayingBuyerAgent) || null,

      // Earnest money & closing costs
      earnestMoney: toNum(body.earnestMoney) || null,
      depositHolder: toStr(body.depositHolder) || null,
      depositHolderOther: toStr(body.depositHolderOther) || null,
      buyerBringToClosing: toNum(body.buyerBringToClosing) || null,
      buyerClosingCostTotal: toNum(body.buyerClosingCostTotal) || null,
      buyerClosingCostAgentCommission: toNum(body.buyerClosingCostAgentCommission) || null,
      buyerClosingCostTxFee: toNum(body.buyerClosingCostTxFee) || null,
      buyerClosingCostHomeWarranty: toNum(body.buyerClosingCostHomeWarranty) || null,
      buyerClosingCostOther: toNum(body.buyerClosingCostOther) || null,

      // Additional info
      warrantyAtClosing: toStr(body.warrantyAtClosing) || null,
      warrantyAmount: toNum(body.warrantyAmount) || null,
      warrantyPaidBy: toStr(body.warrantyPaidBy) || null,
      txComplianceFee: toStr(body.txComplianceFee) || null,
      txComplianceFeeAmount: toNum(body.txComplianceFeeAmount) || null,
      txComplianceFeePaidBy: toStr(body.txComplianceFeePaidBy) || null,
      occupancyAgreement: toStr(body.occupancyAgreement) || null,
      occupancyDates: toStr(body.occupancyDates) || null,
      shortageInCommission: toStr(body.shortageInCommission) || null,
      shortageAmount: toNum(body.shortageAmount) || null,

      // Pre-listing inspection
      preListingInspectionOrdered: toStr(body.preListingInspectionOrdered) || null,
      preListingTargetInspectionDate: toStr(body.preListingTargetInspectionDate) || null,
      preListingInspectionTypes: toArr(body.preListingInspectionTypes),
      preListingTcScheduleInspections: toStr(body.preListingTcScheduleInspections) || null,
      preListingTcScheduleInspectionsOther: toStr(body.preListingTcScheduleInspectionsOther) || null,
      preListingInspectorName: toStr(body.preListingInspectorName) || null,

      // Buyer inspection (under contract)
      inspectionOrdered: toStr(body.inspectionOrdered) || null,
      targetInspectionDate: toStr(body.targetInspectionDate) || null,
      inspectionTypes: toArr(body.inspectionTypes),
      tcScheduleInspections: toStr(body.tcScheduleInspections) || null,
      tcScheduleInspectionsOther: toStr(body.tcScheduleInspectionsOther) || null,
      inspectorName: toStr(body.inspectorName) || null,

      // Media order
      mediaTypes: toArr(body.mediaTypes),
      mediaRequestedDate: toStr(body.mediaRequestedDate) || null,
      mediaNotes: toStr(body.mediaNotes) || null,

      // Sign order
      signOrderRequested: toBool(body.signOrderRequested),
      signServiceType: toStr(body.signServiceType) || null,
      signAdditionalOptions: toArr(body.signAdditionalOptions),
      signRiderExt: toStr(body.signRiderExt) || null,
      signRequestedDate: toStr(body.signRequestedDate) || null,
      signOwnerName: toStr(body.signOwnerName) || null,
      signSpecialRequests: toStr(body.signSpecialRequests) || null,

      // ShowingTime setup
      showingTimeRequested: toBool(body.showingTimeRequested),
      showingNewOrChange: toStr(body.showingNewOrChange) || null,
      showingApptHandling: toArr(body.showingApptHandling),
      showingApptType: toStr(body.showingApptType) || null,
      showingNoSameDayAppts: toBool(body.showingNoSameDayAppts),
      showingLeadTimeRequired: toStr(body.showingLeadTimeRequired) || null,
      showingLeadTimeSuggested: toStr(body.showingLeadTimeSuggested) || null,
      showingMaxApptLength: toStr(body.showingMaxApptLength) || null,
      showingApptOverlaps: toStr(body.showingApptOverlaps) || null,
      showingVirtualPreference: toStr(body.showingVirtualPreference) || null,
      showingShareAgentInfo: toStr(body.showingShareAgentInfo) || null,
      showingLockboxType: toStr(body.showingLockboxType) || null,
      showingLockboxLocation: toStr(body.showingLockboxLocation) || null,
      showingAccessType: toStr(body.showingAccessType) || null,
      showingAccessNotes: toStr(body.showingAccessNotes) || null,
      showingAccessDoor: toStr(body.showingAccessDoor) || null,
      showingDisarmCode: toStr(body.showingDisarmCode) || null,
      showingArmCode: toStr(body.showingArmCode) || null,
      showingPasscode: toStr(body.showingPasscode) || null,
      showingAlarmNotes: toStr(body.showingAlarmNotes) || null,
      showingAlarmDisarm: toStr(body.showingAlarmDisarm) || null,
      showingAlarmArm: toStr(body.showingAlarmArm) || null,
      showingNotesToAgent: toArr(body.showingNotesToAgent),
      showingNotesToAgentOther: toStr(body.showingNotesToAgentOther) || null,
      showingNotesToStaff: toStr(body.showingNotesToStaff) || null,
      showingCallOrder2Name: toStr(body.showingCallOrder2Name) || null,
      showingCallOrder2Mobile: toStr(body.showingCallOrder2Mobile) || null,
      showingCallOrder2AltPhone: toStr(body.showingCallOrder2AltPhone) || null,
      showingCallOrder2Email: toStr(body.showingCallOrder2Email) || null,
      showingCallOrder2Type: toStr(body.showingCallOrder2Type) || null,
      showingCallOrder2Confirm: toStr(body.showingCallOrder2Confirm) || null,
      showingCallOrder2Notify: toArr(body.showingCallOrder2Notify),
      showingCallOrder3Name: toStr(body.showingCallOrder3Name) || null,
      showingCallOrder3Mobile: toStr(body.showingCallOrder3Mobile) || null,
      showingCallOrder3AltPhone: toStr(body.showingCallOrder3AltPhone) || null,
      showingCallOrder3Email: toStr(body.showingCallOrder3Email) || null,
      showingCallOrder3Type: toStr(body.showingCallOrder3Type) || null,
      showingCallOrder3Confirm: toStr(body.showingCallOrder3Confirm) || null,
      showingCallOrder3Notify: toArr(body.showingCallOrder3Notify),

      // Co-agent
      hasCoAgent: toBool(body.hasCoAgent),
      ...(body.hasCoAgent && toStr(body.coAgentId) ? {
        coAgent: {
          agentId: toStr(body.coAgentId),
          agentDisplayName: toStr(body.coAgentDisplayName) || toStr(body.coAgentId),
          role: toStr(body.coAgentRole) || 'other',
          splitPercent: toNum(body.coAgentSplitPercent) ?? 50,
          coAgentSplitPct: toNum(body.coAgentSplitPercent) ?? 50,
          primarySplitPct: toNum(body.primaryAgentSplitPercent) ?? 50,
        },
        coAgentId: toStr(body.coAgentId),
        coAgentDisplayName: toStr(body.coAgentDisplayName) || null,
        coAgentRole: toStr(body.coAgentRole) || 'other',
        primaryAgentSplitPercent: toNum(body.primaryAgentSplitPercent) ?? 50,
        coAgentSplitPercent: toNum(body.coAgentSplitPercent) ?? 50,
        coAgentSplitPct: toNum(body.coAgentSplitPercent) ?? 50,
        primarySplitPct: toNum(body.primaryAgentSplitPercent) ?? 50,
      } : {}),

      // Outbound referral
      hasOutboundReferral: toBool(body.hasOutboundReferral),
      outboundReferralAgentName: toStr(body.outboundReferralAgentName) || null,
      outboundReferralBrokerage: toStr(body.outboundReferralBrokerage) || null,
      outboundReferralFeePercent: toNum(body.outboundReferralFeePercent) || null,
      outboundReferralFeeDollar: toNum(body.outboundReferralFeeDollar) || null,
      outboundReferralPercent: toNum(body.outboundReferralFeePercent) || toNum(body.outboundReferralPercent) || null,
      outboundReferralDollar: toNum(body.outboundReferralFeeDollar) || toNum(body.outboundReferralDollar) || null,
      outboundReferralRecipient: toStr(body.outboundReferralAgentName) || toStr(body.outboundReferralRecipient) || null,
      ...(toBool(body.hasOutboundReferral) || toNum(body.outboundReferralFeePercent) || toNum(body.outboundReferralFeeDollar) ? {
        outboundReferralFee: {
          referralPercent: toNum(body.outboundReferralFeePercent) || toNum(body.outboundReferralPercent) || null,
          referralDollar: toNum(body.outboundReferralFeeDollar) || toNum(body.outboundReferralDollar) || null,
          brokerName: toStr(body.outboundReferralBrokerage) || '',
          contactName: toStr(body.outboundReferralAgentName) || '',
        },
      } : {}),

      // Inbound referral
      hasInboundReferral: toBool(body.hasInboundReferral),
      inboundReferralAgentName: toStr(body.inboundReferralAgentName) || null,
      inboundReferralFeePercent: toNum(body.inboundReferralFeePercent) || null,
      inboundReferralFeeDollar: toNum(body.inboundReferralFeeDollar) || null,

      // Commercial fields
      commercialForLease: toBool(body.commercialForLease),
      commercialForSale: toBool(body.commercialForSale),
      commercialSalePrice: toNum(body.commercialSalePrice) || null,
      commercialLeaseMonthly: toNum(body.commercialLeaseMonthly) || null,
      commercialLeaseTerm: toNum(body.commercialLeaseTerm) || null,
      commercialLeasePricePerSqft: toNum(body.commercialLeasePricePerSqft) || null,
      commercialTotalLeaseValue: toNum(body.commercialTotalLeaseValue) || null,
      commercialLeaseCommissionMode: toStr(body.commercialLeaseCommissionMode) || null,
      commercialLeaseCommissionPct: toNum(body.commercialLeaseCommissionPct) || null,
      commercialLeaseCommissionFlat: toNum(body.commercialLeaseCommissionFlat) || null,
      commercialLeaseGci: toNum(body.commercialLeaseGci) || null,
      commercialLeaseEffectivePct: toNum(body.commercialLeaseEffectivePct) || null,

      // Notes & documents
      notes: toStr(body.notes) || null,
      additionalComments: toStr(body.additionalComments) || null,
      documents,

      // System metadata
      year: now.getFullYear(),
      source: 'agent_submission',
      createdAt: now,
      updatedAt: now,
    };

    // Pre-allocate document references
    const txRef = adminDb.collection('transactions').doc();
    let tcIntakeRef: FirebaseFirestore.DocumentReference | null = null;
    if (workingWithTc) {
      tcIntakeRef = adminDb.collection('tcIntakes').doc();
    }

    // Atomic batch write
    const mainBatch = adminDb.batch();

    // 1. Write the canonical transaction document (all fields)
    mainBatch.set(txRef, {
      ...txDoc,
      ...(tcIntakeRef ? { tcIntakeId: tcIntakeRef.id, reviewStatus: 'pending_review' } : {}),
    });

    // 2. Write the TC intake wrapper (lightweight — points to transaction)
    if (tcIntakeRef) {
      mainBatch.set(tcIntakeRef, {
        transactionId: txRef.id,
        approvedTransactionId: txRef.id,
        status: 'submitted',
        tcStatus: 'submitted',
        tcAssignedTo: null,
        // Denormalized display fields for TC queue list view
        agentId,
        agentDisplayName,
        submittedByUid: uid,
        submittedByEmail: email,
        address,
        propertyAddress: address,
        clientName,
        closingType,
        dealType,
        listingStatus: toStr(body.status) || 'active',
        listPrice: toNum(body.listPrice),
        salePrice: toNum(body.salePrice),
        gci: toNum(body.gci) || toNum(body.commission) || null,
        commissionPercent: toNum(body.commissionPercent) || null,
        agentDollar: toNum(body.agentDollar) || null,
        agentPct: toNum(body.agentPct) || null,
        brokerGci: toNum(body.brokerGci) || null,
        brokerPct: toNum(body.brokerPct) || null,
        contractDate: contractDate || null,
        listingDate: toStr(body.listingDate) || null,
        projectedCloseDate: toStr(body.projectedCloseDate) || null,
        submittedAt: now,
        updatedAt: now,
      });
    }

    // 3. Write the staff queue item (if listing type)
    let staffQueueRef: FirebaseFirestore.DocumentReference | null = null;
    if (isListingType) {
      staffQueueRef = adminDb.collection('staffQueue').doc();
      mainBatch.set(staffQueueRef, {
        transactionId: txRef.id,
        tcIntakeId: (workingWithTc && tcIntakeRef) ? tcIntakeRef.id : null,
        agentId,
        agentName: agentDisplayName,
        submittedBy: uid,
        clientName,
        address,
        propertyAddress: address,
        status: 'pending_review',
        listingStatus: toStr(body.status) || 'active',
        closingType,
        dealType,
        listPrice: toNum(body.listPrice),
        actionType: 'new_listing',
        newStatus: toStr(body.status) || 'active',
        signOrderRequested: toBool(body.signOrderRequested),
        showingTimeRequested: toBool(body.showingTimeRequested),
        createdAt: now,
        updatedAt: now,
      });
    }

    await mainBatch.commit();

    // Checklist subcollections (after main batch — non-fatal if they fail)
    try {
      const checklistBatch = adminDb.batch();
      if (workingWithTc && tcIntakeRef) {
        const defaultTcChecklist = [
          { label: 'Review transaction details', order: 1, completed: false },
          { label: 'Verify commission calculation', order: 2, completed: false },
          { label: 'Confirm client contact info', order: 3, completed: false },
          { label: 'Upload signed documents', order: 4, completed: false },
          { label: 'Approve transaction', order: 5, completed: false },
        ];
        for (const item of defaultTcChecklist) {
          const itemRef = adminDb.collection('tcIntakes').doc(tcIntakeRef.id).collection('checklist').doc();
          checklistBatch.set(itemRef, { ...item, createdAt: now });
        }
      }
      if (isListingType && staffQueueRef) {
        const defaultStaffChecklist = [
          { label: 'Review new listing', order: 1, completed: false },
          { label: 'Process sign order (if requested)', order: 2, completed: false },
          { label: 'Set up ShowingTime (if requested)', order: 3, completed: false },
          { label: 'Schedule media (if requested)', order: 4, completed: false },
          { label: 'Schedule pre-listing inspection (if requested)', order: 5, completed: false },
        ];
        for (const item of defaultStaffChecklist) {
          const itemRef = adminDb.collection('staffQueue').doc(staffQueueRef.id).collection('checklist').doc();
          checklistBatch.set(itemRef, { ...item, createdAt: now });
        }
      }
      await checklistBatch.commit();
    } catch (checklistErr) {
      console.error('[POST /api/tc] checklist write error (non-fatal):', checklistErr);
    }

    // Notifications (fire-and-forget)
    (async () => {
      try {
        if (workingWithTc) {
          const tcUids = await getTcUids(adminDb);
          if (tcUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'tc_new_intake',
              recipientUids: tcUids,
              title: 'New TC Intake Submitted',
              body: `${agentDisplayName} submitted a new transaction for TC review: ${address}`,
              url: tcIntakeRef ? `/dashboard/admin/tc/${tcIntakeRef.id}` : '/dashboard/admin/tc',
            });
          }
        }
        if (isListingType) {
          const staffUids = await getStaffUidsForAgent(adminDb, agentId);
          const allStaffUids = staffUids.length > 0 ? staffUids : await getAllStaffUids(adminDb);
          if (allStaffUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'staff_queue_new',
              recipientUids: allStaffUids,
              title: `New Listing — ${address}`,
              body: `${agentDisplayName} added a new listing: ${address}`,
              url: staffQueueRef ? `/dashboard/admin/staff-queue/${staffQueueRef.id}` : '/dashboard/admin/staff-queue',
            });
          }
        }
        if (!isListingType) {
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'tx_new_agent',
              recipientUids: staffUids,
              title: 'New Transaction Added',
              body: `${agentDisplayName} added a new transaction: ${address}`,
              url: '/dashboard/admin/transactions',
            });
          }
        }
        if (isListingType && toBool(body.signOrderRequested)) {
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            const signService = toStr(body.signServiceType) || 'Not specified';
            const signDate = toStr(body.signRequestedDate) || 'Not specified';
            const signAdditional = toArr(body.signAdditionalOptions).join(', ') || 'None';
            const signOwner = toStr(body.signOwnerName) || 'Not provided';
            const signSpecial = toStr(body.signSpecialRequests) || 'None';
            await sendNotification(adminDb, {
              type: 'staff_queue_new',
              recipientUids: staffUids,
              title: `Sign Order Request — ${address}`,
              body: `Agent: ${agentDisplayName}\nProperty: ${address}\nService: ${signService}\nRequested Date: ${signDate}\nAdditional Options: ${signAdditional}\nOwner Name: ${signOwner}\nSpecial Requests: ${signSpecial}`,
              url: staffQueueRef ? `/dashboard/admin/staff-queue/${staffQueueRef.id}` : '/dashboard/admin/staff-queue',
            });
          }
        }
        if (isListingType && toBool(body.showingTimeRequested)) {
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            const showingType = toStr(body.showingNewOrChange) === 'change' ? 'Change/Update' : 'New Setup';
            const apptHandling = toArr(body.showingApptHandling).join(', ') || 'Not specified';
            const lockboxType = toStr(body.showingLockboxType) || 'Not specified';
            const lockboxLocation = toStr(body.showingLockboxLocation) || 'Not specified';
            await sendNotification(adminDb, {
              type: 'staff_queue_new',
              recipientUids: staffUids,
              title: `ShowingTime Setup Request — ${address}`,
              body: `Agent: ${agentDisplayName}\nProperty: ${address}\nRequest Type: ${showingType}\nAppointment Handling: ${apptHandling}\nLockbox Type: ${lockboxType}\nLockbox Location: ${lockboxLocation}`,
              url: staffQueueRef ? `/dashboard/admin/staff-queue/${staffQueueRef.id}` : '/dashboard/admin/staff-queue',
            });
          }
        }
      } catch (notifErr) {
        console.error('[POST /api/tc] notification error:', notifErr);
      }
    })();

    return NextResponse.json({
      ok: true,
      id: tcIntakeRef?.id ?? txRef.id,
      transactionId: txRef.id,
      tcIntakeId: tcIntakeRef?.id ?? null,
    });
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

    // Query transactions directly (single source of truth)
    const snap = await adminDb
      .collection('transactions')
      .where('submittedByUid', '==', uid)
      .where('tcStatus', 'in', ['submitted', 'in_review', 'approved', 'rejected'])
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const intakes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, intakes });
  } catch (err: any) {
    // Fallback to tcIntakes for backward compatibility with old records
    try {
      const decoded = await adminAuth.verifyIdToken(
        (req.headers.get('Authorization') || '').slice('Bearer '.length).trim()
      );
      const snap = await adminDb
        .collection('tcIntakes')
        .where('submittedByUid', '==', decoded.uid)
        .orderBy('submittedAt', 'desc')
        .limit(100)
        .get();
      const intakes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ ok: true, intakes });
    } catch {
      console.error('[GET /api/tc]', err);
      return NextResponse.json({ ok: false, error: err.message || 'Internal Server Error' }, { status: 500 });
    }
  }
}
