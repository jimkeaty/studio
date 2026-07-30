// POST /api/tc — any authenticated agent submits a new TC intake
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

const VALID_CLOSING_TYPES = new Set(['buyer', 'listing', 'referral', 'dual']);
const VALID_DEAL_TYPES = new Set([
  'residential_sale', 'residential_lease', 'land',
  'commercial_listing', 'commercial_sale', 'commercial_lease',
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

    const closingType = toStr(body.closingType);
    if (!closingType || !VALID_CLOSING_TYPES.has(closingType)) {
      return jsonError(400, 'closingType must be: buyer, listing, dual, or referral');
    }

    // clientName is optional for listings (seller not yet known) and referrals
    // (client may not be known at time of referral entry).
    // Fall back to sellerName or buyerName so all types can always be saved.
    const clientName =
      toStr(body.clientName) ||
      toStr(body.sellerName) ||
      toStr(body.buyerName) ||
      '';
    if (!clientName && closingType !== 'listing' && closingType !== 'referral') {
      return jsonError(400, 'clientName is required');
    }

    const contractDate = toStr(body.contractDate);
    // contractDate is optional — listings may not yet be under contract

    const dealType = toStr(body.dealType) || 'residential_sale';
    if (!VALID_DEAL_TYPES.has(dealType)) {
      return jsonError(400, 'invalid dealType');
    }

    // Agent info — use requesting user if not overridden
    // Normalize agentId to the slug-based agentProfiles document ID so downstream
    // commission calculation and rollup queries work correctly.
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
        if (!byUidSnap.empty) {
          agentId = byUidSnap.docs[0].id;
        }
      }
    } catch { /* non-fatal */ }

    // Determine if the submitter is an admin (used to gate commission split fields)
    const isAdmin = await isAdminLike(uid);

    const now = new Date();

    // Hoist these flags early so they can gate TC intake creation below.
    // The form sends tcWorking='yes'/'no'; also accept workingWithTc boolean for API callers.
    const workingWithTc = body.workingWithTc === true || body.workingWithTc === 'true' || body.tcWorking === 'yes';
    const isListingType = closingType === 'listing' || closingType === 'dual';

    const intake: Record<string, any> = {
      agentId,
      agentDisplayName,
      submittedByUid: uid,
      submittedByEmail: email,

      status: 'submitted',
      listingStatus: toStr(body.status) || 'active',

      closingType,
      dealType,
      address,
      clientName,

      // Financial
      listPrice: toNum(body.listPrice),
      salePrice: toNum(body.salePrice),
      commissionPercent: toNum(body.commissionPercent),
      commissionBasePrice: toNum(body.commissionBasePrice) || toNum(body.salePrice) || null,
      gci: toNum(body.gci),
      transactionFee: toNum(body.transactionFee),
      earnestMoney: toNum(body.earnestMoney),
      // Commission split fields — always stored from agent submission so TC can review.
      // TC can override before approving. Stored as submitted values for transparency.
      brokerPct: toNum(body.brokerPct) || null,
      brokerGci: toNum(body.brokerGci) || null,
      agentPct: toNum(body.agentPct) || null,
      agentDollar: toNum(body.agentDollar) || null,
      // Outbound referral fee
      hasOutboundReferral: !!body.hasOutboundReferral,
      outboundReferralPercent: toNum(body.outboundReferralPercent) || null,
      outboundReferralDollar: toNum(body.outboundReferralDollar) || null,
      outboundReferralRecipient: toStr(body.outboundReferralRecipient) || null,

      // Dates
      listingDate: toStr(body.listingDate),
      contractDate: contractDate || null,
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
      clientType: toStr(body.clientType),
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
      buyer3Name: toStr(body.buyer3Name),
      buyer3Email: toStr(body.buyer3Email),
      buyer3Phone: toStr(body.buyer3Phone),
      buyer4Name: toStr(body.buyer4Name),
      buyer4Email: toStr(body.buyer4Email),
      buyer4Phone: toStr(body.buyer4Phone),

      // Seller contact
      sellerName: toStr(body.sellerName),
      sellerEmail: toStr(body.sellerEmail),
      sellerPhone: toStr(body.sellerPhone),
      seller2Name: toStr(body.seller2Name),
      seller2Email: toStr(body.seller2Email),
      seller2Phone: toStr(body.seller2Phone),
      seller3Name: toStr(body.seller3Name),
      seller3Email: toStr(body.seller3Email),
      seller3Phone: toStr(body.seller3Phone),
      seller4Name: toStr(body.seller4Name),
      seller4Email: toStr(body.seller4Email),
      seller4Phone: toStr(body.seller4Phone),

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

      // MLS Description (AI-generated or manually entered)
      mlsDescription: toStr(body.mlsDescription) || null,

      // Buyer closing cost paid by seller
      buyerClosingCostTotal: toNum(body.buyerClosingCostTotal),
      buyerClosingCostAgentCommission: toNum(body.buyerClosingCostAgentCommission),
      buyerClosingCostTxFee: toNum(body.buyerClosingCostTxFee),
      buyerClosingCostHomeWarranty: toNum(body.buyerClosingCostHomeWarranty),
      buyerClosingCostOther: toNum(body.buyerClosingCostOther),

      // Seller-paying commission
      sellerPayingListingAgent: toNum(body.sellerPayingListingAgent),
      sellerPayingListingAgentUnknown: !!body.sellerPayingListingAgentUnknown,
      sellerPayingBuyerAgent: toNum(body.sellerPayingBuyerAgent),

      // Additional info
      warrantyAtClosing: toStr(body.warrantyAtClosing),
      warrantyPaidBy: toStr(body.warrantyPaidBy),
      txComplianceFee: toStr(body.txComplianceFee),
      txComplianceFeeAmount: toNum(body.txComplianceFeeAmount),
      txComplianceFeePaidBy: toStr(body.txComplianceFeePaidBy),
      shortageInCommission: toStr(body.shortageInCommission),
      shortageAmount: toNum(body.shortageAmount),
      buyerBringToClosing: toNum(body.buyerBringToClosing),
      additionalComments: toStr(body.additionalComments),
      depositHolder: toStr(body.depositHolder),
      depositHolderOther: toStr(body.depositHolderOther),

      // Outbound referral fee — paid to an outside broker/relocation company
      // Deducted from GCI before agent/broker split is calculated on approval
      ...(body.hasOutboundReferral || body.outboundReferralFeePercent || body.outboundReferralFeeDollar ? {
        outboundReferralFee: {
          referralPercent: toNum(body.outboundReferralFeePercent) || toNum(body.outboundReferralPercent) || null,
          referralDollar: toNum(body.outboundReferralFeeDollar) || toNum(body.outboundReferralDollar) || null,
          brokerName: toStr(body.outboundReferralBrokerage) || toStr(body.outboundReferralBrokerName) || '',
          contactName: toStr(body.outboundReferralAgentName) || toStr(body.outboundReferralContactName) || '',
        },
      } : {}),

      // Co-agent fields — stored for TC review; commission calculated on approval
      hasCoAgent: !!body.hasCoAgent,
      ...(body.hasCoAgent ? {
        coAgentId: toStr(body.coAgentId),
        coAgentDisplayName: toStr(body.coAgentDisplayName),
        coAgentRole: toStr(body.coAgentRole) || 'other',
        primaryAgentSplitPercent: toNum(body.primaryAgentSplitPercent),
        coAgentSplitPercent: toNum(body.coAgentSplitPercent),
      } : {}),

      // Uploaded documents (Purchase Agreement, Listing Paperwork, etc.)
      // Each entry: { name, url, storagePath, uploadedAt }
      documents: Array.isArray(body.documents)
        ? body.documents
            .filter((d: any) => d && typeof d.url === 'string' && typeof d.name === 'string')
            .map((d: any) => ({
              name: String(d.name).slice(0, 255),
              url: String(d.url),
              storagePath: String(d.storagePath || ''),
              uploadedAt: String(d.uploadedAt || new Date().toISOString()),
            }))
        : [],

      submittedAt: now,
      updatedAt: now,
    };

    // ── TC Intake — create whenever agent is working with a TC, regardless of transaction type ──
    // This includes buyer transactions, listings, dual agency, and referrals.
    // If workingWithTc is false, skip tcIntakes entirely. The transaction doc is still
    // created below so the agent sees it in their ledger immediately.
    //
    // IMPORTANT: Pre-allocate document references so we can use a batch write.
    // This ensures tcIntakes + transactions + staffQueue all succeed or all fail
    // atomically, preventing orphaned staffQueue items that point to non-existent
    // transaction documents (the root cause of the staff queue missing data bug).
    let ref: FirebaseFirestore.DocumentReference | null = null;
    if (workingWithTc) {
      ref = adminDb.collection('tcIntakes').doc(); // pre-allocate ID without writing yet
    }

    // ── Create a transactions doc immediately so the agent sees it right away ──
    // The doc is marked reviewStatus:'pending_review' so the admin ledger can
    // distinguish it from fully-approved transactions. When TC approves the intake,
    // the approval route updates this same doc (via approvedTransactionId linkage)
    // rather than creating a duplicate.
    const txDoc: Record<string, any> = {
      agentId,
      agentDisplayName,
      submittedByUid: uid,
      address,
      propertyAddress: address,
      status: toStr(body.status) || 'active',
      closingType,
      transactionType: dealType,
      dealType,
      listPrice: toNum(body.listPrice),
      salePrice: toNum(body.salePrice),
      listingDate: toStr(body.listingDate) || null,
      contractDate: contractDate || null,
      closingDate: toStr(body.closedDate) || toStr(body.closingDate) || null,
      closedDate: toStr(body.closedDate) || null,
      optionExpiration: toStr(body.optionExpiration) || null,
      inspectionDeadline: toStr(body.inspectionDeadline) || null,
      projectedCloseDate: toStr(body.projectedCloseDate) || null,
      clientName,
      clientEmail: toStr(body.clientEmail) || null,
      clientPhone: toStr(body.clientPhone) || null,
      sellerName: toStr(body.sellerName) || null,
      sellerEmail: toStr(body.sellerEmail) || null,
      sellerPhone: toStr(body.sellerPhone) || null,
      buyerName: toStr(body.buyerName) || null,
      buyerEmail: toStr(body.buyerEmail) || null,
      buyerPhone: toStr(body.buyerPhone) || null,
      otherAgentName: toStr(body.otherAgentName) || null,
      otherAgentEmail: toStr(body.otherAgentEmail) || null,
      otherAgentPhone: toStr(body.otherAgentPhone) || null,
      otherAgentBrokerage: toStr(body.otherBrokerage) || null,
      mortgageCompany: toStr(body.mortgageCompany) || null,
      loanOfficer: toStr(body.loanOfficer) || null,
      loanOfficerEmail: toStr(body.loanOfficerEmail) || null,
      loanOfficerPhone: toStr(body.loanOfficerPhone) || null,
      titleCompany: toStr(body.titleCompany) || null,
      titleOfficer: toStr(body.titleOfficer) || null,
      titleOfficerEmail: toStr(body.titleOfficerEmail) || null,
      titleOfficerPhone: toStr(body.titleOfficerPhone) || null,
      notes: toStr(body.notes) || null,
      additionalComments: toStr(body.additionalComments) || null,
      mlsDescription: toStr(body.mlsDescription) || null,
      documents: Array.isArray(body.documents)
        ? body.documents.filter((d: any) => d?.url && d?.name)
        : [],
      // Use the already-resolved workingWithTc boolean (derived from body.workingWithTc OR
      // body.tcWorking==='yes' at line 105) so the transaction doc always reflects the correct
      // TC flag regardless of which field name the form used.
      workingWithTc,
      // Co-agent fields — mirrored from intake so the split can fire on TC approval
      hasCoAgent: !!body.hasCoAgent,
      ...(body.hasCoAgent && toStr(body.coAgentId) ? {
        coAgent: {
          agentId: toStr(body.coAgentId),
          agentDisplayName: toStr(body.coAgentDisplayName) || toStr(body.coAgentId),
          role: toStr(body.coAgentRole) || 'other',
          splitPercent: toNum(body.coAgentSplitPercent) ?? 50,
          coAgentSplitPct: toNum(body.coAgentSplitPercent) ?? 50,
          primarySplitPct: toNum(body.primaryAgentSplitPercent) ?? 50,
        },
        primaryAgentSplitPercent: toNum(body.primaryAgentSplitPercent) ?? 50,
        coAgentSplitPercent: toNum(body.coAgentSplitPercent) ?? 50,
      } : {}),
      // Commission fields — stored from agent submission so the ledger shows commission
      // immediately. The TC can review and override before approving. These are stored
      // as a pendingCommissionSnapshot so the TC knows they came from the agent's form.
      commission: toNum(body.gci) || toNum(body.commission) || null,
      gci: toNum(body.gci) || toNum(body.commission) || null,
      commissionPercent: toNum(body.commissionPercent) || null,
      transactionFee: toNum(body.transactionFee) || null,
      agentDollar: toNum(body.agentDollar) || null,
      brokerGci: toNum(body.brokerGci) || null,
      agentPct: toNum(body.agentPct) || null,
      brokerPct: toNum(body.brokerPct) || null,
      ...(toNum(body.agentDollar) || toNum(body.brokerGci)
        ? (() => {
            // ── Agent-paid compliance fee deduction ───────────────────────────
            // Belt-and-suspenders: the form now stores agentDollar as the post-fee
            // net. This server-side check ensures the splitSnapshot is always correct
            // regardless of which form version submitted the data.
            const _rawAgentNet = toNum(body.agentDollar) || 0;
            const _txFeeAmt = toNum(body.txComplianceFeeAmount) || 0;
            const _txFeePaidBy = String(body.txComplianceFeePaidBy || '').toLowerCase().trim();
            const _agentPaysFee = body.txComplianceFee === 'yes' && _txFeeAmt > 0 && _txFeePaidBy === 'agent';
            // The form already subtracts the fee from agentDollar (post-fix), so we
            // only deduct server-side if the submitted value appears to be pre-fee
            // (i.e., agentDollar > agentDollar - fee, which is always true when fee > 0).
            // To avoid double-deduction we check: if agentDollar already equals the
            // expected post-fee value, skip the server-side deduction.
            const _expectedPostFee = _agentPaysFee ? Number(Math.max(0, _rawAgentNet - _txFeeAmt).toFixed(2)) : _rawAgentNet;
            // If the submitted value already matches the post-fee amount, no deduction needed.
            // Otherwise apply it (handles old form submissions that sent pre-fee agentDollar).
            const _agentNetCommission = _agentPaysFee && Math.abs(_rawAgentNet - _expectedPostFee) > 0.01
              ? _expectedPostFee
              : _rawAgentNet;
            return {
              splitSnapshot: {
                grossCommission: toNum(body.gci) || toNum(body.commission) || null,
                agentNetCommission: _agentNetCommission || null,
                companyRetained: toNum(body.brokerGci) || null,
                ...(_agentPaysFee ? { agentFeeDeduction: _txFeeAmt } : {}),
              },
            };
          })()
        : {}),
      // Outbound referral fee — stored for TC review
      hasOutboundReferral: !!body.hasOutboundReferral,
      outboundReferralPercent: toNum(body.outboundReferralPercent) || null,
      outboundReferralDollar: toNum(body.outboundReferralDollar) || null,
      outboundReferralRecipient: toStr(body.outboundReferralRecipient) || null,
      // Sign order — stored so staff can see the full request details in the Staff Queue item
      signOrderRequested: body.signOrderRequested === true,
      ...(body.signOrderRequested === true ? {
        signServiceType: toStr(body.signServiceType) || null,
        signAdditionalOptions: Array.isArray(body.signAdditionalOptions) ? body.signAdditionalOptions : [],
        signRiderExt: toStr(body.signRiderExt) || null,
        signRequestedDate: toStr(body.signRequestedDate) || null,
        signOwnerName: toStr(body.signOwnerName) || null,
        signSpecialRequests: toStr(body.signSpecialRequests) || null,
      } : {}),
      // ShowingTime setup — stored so staff can see the full request details in the Staff Queue item
      showingTimeRequested: body.showingTimeRequested === true,
      ...(body.showingTimeRequested === true ? {
        showingNewOrChange: toStr(body.showingNewOrChange) || null,
        showingApptHandling: Array.isArray(body.showingApptHandling) ? body.showingApptHandling : [],
        showingLockboxType: toStr(body.showingLockboxType) || null,
        showingLockboxLocation: toStr(body.showingLockboxLocation) || null,
        showingAlarmDisarm: toStr(body.showingAlarmDisarm) || null,
        showingAlarmArm: toStr(body.showingAlarmArm) || null,
        showingNotesToAgent: Array.isArray(body.showingNotesToAgent) ? body.showingNotesToAgent : [],
        showingNotesToStaff: toStr(body.showingNotesToStaff) || null,
      } : {}),
      // Review status flags — only set reviewStatus/tcIntakeId when TC intake was created
      ...(ref ? { reviewStatus: 'pending_review', tcIntakeId: ref.id } : {}),
      year: new Date().getFullYear(),
      source: 'agent_submission',
      createdAt: now,
      updatedAt: now,
    };

    // ── Atomic batch write: tcIntakes + transactions + staffQueue ─────────────
    // Pre-allocate the transaction document reference so we can link it in the
    // staffQueue item before committing. All three writes go in one batch so
    // they all succeed or all fail — no more orphaned staffQueue items.
    const txRef = adminDb.collection('transactions').doc(); // pre-allocate ID
    const mainBatch = adminDb.batch();

    // Write the transaction document
    mainBatch.set(txRef, txDoc);

    // Write the TC intake document (if working with TC)
    if (ref) {
      // Add approvedTransactionId to intake so approval route can update the transaction in place
      mainBatch.set(ref, { ...intake, approvedTransactionId: txRef.id });
    }

    // Write the staff queue item (if listing type)
    let staffQueueRef: FirebaseFirestore.DocumentReference | null = null;
    if (isListingType) {
      staffQueueRef = adminDb.collection('staffQueue').doc();
      const staffQueueItem: Record<string, any> = {
        transactionId: txRef.id,
        tcIntakeId: (workingWithTc && ref) ? ref.id : null,
        agentId,
        agentName: agentDisplayName,
        submittedBy: uid,
        submittedByName: agentDisplayName,
        actionType: 'new_listing',
        closingType,
        previousStatus: null,
        newStatus: toStr(body.status) || 'active',
        notes: toStr(body.notes) || null,
        tcWorking: workingWithTc,
        status: 'pending_review',
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        staffNotes: null,
        address: address,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      mainBatch.set(staffQueueRef, staffQueueItem);
    }

    // Commit all three writes atomically
    await mainBatch.commit();

    if (ref) {
      // Create default checklist items as a subcollection (same as admin-created intakes)
      // These are non-critical and written after the main batch
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
          .doc(ref.id)
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
    }

    // Buyer/referral transactions with workingWithTc=false are saved to the transaction ledger only.
    // Staff queue for listings was already written atomically in mainBatch above.

    // ── Agent Task Workflow: auto-create on new transaction ───────────────────
    try {
      const workflowType = isListingType ? 'seller_workflow' : 'buyer_workflow';
      const { getAgentTaskDef } = await import('@/lib/checklists/definitions');
      const taskDef = getAgentTaskDef(workflowType as 'seller_workflow' | 'buyer_workflow');
      const taskItems = taskDef.map((t: any) => ({
        ...t,
        completed: false,
        completedAt: null,
      }));
      await adminDb.collection('agentTasks').add({
        transactionId: txRef.id,
        agentId,
        workflowType,
        tasks: taskItems,
        closingDate: toStr(body.closingDate) || null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    } catch (taskErr: any) {
      console.error('[tc route] agent task creation failed (non-fatal):', taskErr?.message);
    }

    // ── Staff Checklist: auto-create new_listing checklist for listing transactions ──
    try {
      if (isListingType) {
        const { getChecklistDef } = await import('@/lib/checklists/definitions');
        const checklistDef = getChecklistDef('new_listing');
        const checklistItems = checklistDef.map((item: any) => ({
          ...item,
          completed: false,
          completedAt: null,
          completedBy: null,
          note: null,
        }));
        await adminDb.collection('transactionChecklists').add({
          transactionId: txRef.id,
          agentId,
          checklistType: 'new_listing',
          items: checklistItems,
          status: 'active',
          agentUpdateBanner: false,
          completedAt: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
    } catch (clErr: any) {
      console.error('[tc route] checklist creation failed (non-fatal):', clErr?.message);
    }

    // ── Notifications ────────────────────────────────────────────────────────
    // Fire-and-forget: don't let notification errors block the response
    void (async () => {
      try {
        // TC notification: whenever workingWithTc is enabled (any transaction type)
        if (workingWithTc) {
          const tcUids = await getTcUids(adminDb);
          if (tcUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'tc_new_intake',
              recipientUids: tcUids,
              title: 'New TC Intake Submitted',
              body: `${agentDisplayName} submitted a new ${isListingType ? 'listing' : 'buyer'} transaction: ${address}`,
              url: '/dashboard/admin/tc',
            });
          }
        }
        // Staff queue notification: always for listings (staff always sees new listings)
        if (isListingType) {
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'staff_queue_new',
              recipientUids: staffUids,
              title: 'New Listing Submitted',
              body: `${agentDisplayName} submitted a new listing: ${address}`,
              url: '/dashboard/admin/staff-queue',
            });
          }
        }
        // For buyer/referral transactions (not listings): notify staff via transaction ledger
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
        // Sign Order notification — send to all staff if agent requested a sign order
        const signOrderRequested = body.signOrderRequested === true;
        if (isListingType && signOrderRequested) {
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            const signService = toStr(body.signServiceType) || 'Not specified';
            const signDate = toStr(body.signRequestedDate) || 'Not specified';
            const signAdditional = Array.isArray(body.signAdditionalOptions) && body.signAdditionalOptions.length > 0
              ? body.signAdditionalOptions.join(', ')
              : 'None';
            const signOwner = toStr(body.signOwnerName) || 'Not provided';
            const signSpecial = toStr(body.signSpecialRequests) || 'None';
            const signBody = `Agent: ${agentDisplayName}\nProperty: ${address}\nService: ${signService}\nRequested Date: ${signDate}\nAdditional Options: ${signAdditional}\nOwner Name (for sign): ${signOwner}\nSpecial Requests: ${signSpecial}\n\nPlease add QR code/text rider number as needed before forwarding to PostMan337.`;
            await sendNotification(adminDb, {
              type: 'staff_queue_new',
              recipientUids: staffUids,
              title: `Sign Order Request — ${address}`,
              body: signBody,
              url: '/dashboard/admin/staff-queue',
            });
          }
        }
        // ShowingTime Setup notification — send to all staff if agent requested ShowingTime setup
        const showingTimeRequested = body.showingTimeRequested === true;
        if (isListingType && showingTimeRequested) {
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            const showingType = toStr(body.showingNewOrChange) === 'change' ? 'Change/Update' : 'New Setup';
            const apptHandling = Array.isArray(body.showingApptHandling) && body.showingApptHandling.length > 0
              ? body.showingApptHandling.join(', ')
              : 'Not specified';
            const lockboxType = toStr(body.showingLockboxType) || 'Not specified';
            const lockboxLocation = toStr(body.showingLockboxLocation) || 'Not specified';
            const alarmDisarm = toStr(body.showingAlarmDisarm) || 'None';
            const alarmArm = toStr(body.showingAlarmArm) || 'None';
            const notesToAgent = Array.isArray(body.showingNotesToAgent) && body.showingNotesToAgent.length > 0
              ? body.showingNotesToAgent.join(', ')
              : 'None';
            const notesToStaff = toStr(body.showingNotesToStaff) || 'None';
            const showingBody = `Agent: ${agentDisplayName}\nProperty: ${address}\nRequest Type: ${showingType}\nAppointment Handling: ${apptHandling}\nLockbox Type: ${lockboxType}\nLockbox Location: ${lockboxLocation}\nAlarm Disarm: ${alarmDisarm} | Arm: ${alarmArm}\nNotes to Showing Agent: ${notesToAgent}\nNotes to Staff: ${notesToStaff}\n\nPlease set up in ShowingTime portal or email the completed form.`;
            await sendNotification(adminDb, {
              type: 'staff_queue_new',
              recipientUids: staffUids,
              title: `ShowingTime Setup Request — ${address}`,
              body: showingBody,
              url: '/dashboard/admin/staff-queue',
            });
          }
        }
      } catch (notifErr) {
        console.error('[POST /api/tc] notification error:', notifErr);
      }
    })();

    return NextResponse.json({ ok: true, id: ref?.id ?? txRef.id, transactionId: txRef.id });
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
      .collection('tcIntakes')
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
