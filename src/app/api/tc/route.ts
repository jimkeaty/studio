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
      // Commission split fields — only admins may set these; agents' submitted values are ignored
      // and recalculated from the agent's saved profile during TC approval.
      ...(isAdmin
        ? {
            brokerPct: toNum(body.brokerPct),
            brokerGci: toNum(body.brokerGci),
            agentPct: toNum(body.agentPct),
            agentDollar: toNum(body.agentDollar),
          }
        : {}),

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

    const ref = await adminDb.collection('tcIntakes').add(intake);

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
      dealValue: toNum(body.salePrice) || toNum(body.listPrice),
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
      documents: Array.isArray(body.documents)
        ? body.documents.filter((d: any) => d?.url && d?.name)
        : [],
      workingWithTc: !!body.workingWithTc,
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
      // Review status flags — cleared when TC approves
      reviewStatus: 'pending_review',
      tcIntakeId: ref.id,
      year: new Date().getFullYear(),
      source: 'agent_submission',
      createdAt: now,
      updatedAt: now,
    };
    const txRef = await adminDb.collection('transactions').add(txDoc);
    // Link the tcIntake back to this transaction so approval updates it in place
    await ref.update({ approvedTransactionId: txRef.id });

    // Create default checklist items as a subcollection (same as admin-created intakes)
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

    // ── Queue routing ─────────────────────────────────────────────────────────
    // Rules:
    //   - TC queue (tcIntakes): ONLY listings (closingType = 'listing' or 'dual') where the agent
    //     toggled "Working with TC" ON. Buyer/referral transactions never go to the TC queue.
    //   - Staff queue: ALL listings go here (regardless of TC flag) so staff always sees new listings.
    //     Buyer/referral transactions are NOT added to the staff queue on new submission — they appear
    //     in the transaction ledger and only hit the staff queue when they close.
    const workingWithTc = !!body.workingWithTc;
    const isListingType = closingType === 'listing' || closingType === 'dual';

    // Staff queue — always for listings
    if (isListingType) {
      const staffQueueItem: Record<string, any> = {
        transactionId: txRef.id, // Link immediately since we create the transaction doc above
        tcIntakeId: workingWithTc ? ref.id : null, // Only link TC intake when agent is using TC
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
      await adminDb.collection('staffQueue').add(staffQueueItem);
    }
    // Buyer/referral transactions are saved to the transaction ledger only (no staff queue or TC queue entry on new submission)

    // ── Notifications ────────────────────────────────────────────────────────
    // Fire-and-forget: don't let notification errors block the response
    void (async () => {
      try {
        // TC notification: only for listings with workingWithTc enabled
        if (isListingType && workingWithTc) {
          const tcUids = await getTcUids(adminDb);
          if (tcUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'tc_new_intake',
              recipientUids: tcUids,
              title: 'New TC Intake Submitted',
              body: `${agentDisplayName} submitted a new listing: ${address}`,
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

    return NextResponse.json({ ok: true, id: ref.id, transactionId: txRef.id });
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
