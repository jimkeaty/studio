// GET /api/admin/transactions — returns all transactions for admin ledger
// PATCH /api/admin/transactions — update a single transaction by id
// DELETE /api/admin/transactions — delete a single transaction by id
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isStaff, getStaffRole } from '@/lib/auth/staffAccess';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import { normalizeDealSource } from '@/lib/normalizeDealSource';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';
import { buildCoAgentAllocationUpdate } from '@/lib/transactions/syncCoAgentAllocations';
import { createTcIntakeWithChecklist, ensureTcChecklist } from '@/lib/transactions/tcChecklist';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getTcUids, getAllStaffUids, getAgentUid } from '@/lib/notifications/getRecipientUids';
import { resolveTransactionSide } from '@/lib/transactions/resolveTransactionSide';

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

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const decoded = await adminAuth.verifyIdToken(token);
  // Allow any staff user (office_admin, tc_admin, tc) to read/write transactions
  if (!(await isStaff(decoded.uid))) return null;
  return decoded;
}

// Statuses that are always loaded regardless of year (open deals must never be hidden)
const ALWAYS_LOAD_STATUSES = ['active', 'pending', 'coming_soon', 'coming soon', 'temporary_off_market', 'temp off market'];

export async function GET(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year'); // 'all' | '2025' | '2026' etc.
    const currentYear = new Date().getFullYear();
    const targetYear = yearParam === 'all' ? null : Number(yearParam || currentYear);

    let transactions: any[];

    if (targetYear === null) {
      // "All Years" — full collection scan (same as before)
      const snap = await adminDb.collection('transactions').get();
      transactions = snap.docs.map(d => serializeFirestore({ id: d.id, ...d.data() }));
    } else {
      // Fetch closed/historical transactions for the target year AND
      // always fetch all active/pending deals regardless of year
      const [yearSnap, openSnap] = await Promise.all([
        adminDb.collection('transactions').where('year', '==', targetYear).get(),
        adminDb.collection('transactions').where('status', 'in', ALWAYS_LOAD_STATUSES).get(),
      ]);

      // Merge and deduplicate by document ID
      const seen = new Set<string>();
      transactions = [];
      for (const d of [...yearSnap.docs, ...openSnap.docs]) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          transactions.push(serializeFirestore({ id: d.id, ...d.data() }));
        }
      }
    }

    // Resolve legacy Buyer/Listing labels only in this GET response. The
    // canonical transaction document is not changed by viewing the ledger.
    transactions = transactions.map((transaction: any) => {
      const sideResolution = resolveTransactionSide(transaction);
      return {
        ...transaction,
        ...(sideResolution.side ? { closingType: sideResolution.side } : {}),
        transactionSideResolution: sideResolution,
      };
    });

    // ── Filter out demo account transactions ─────────────────────────────
    // Load all demo agent IDs from agentProfiles and exclude their transactions
    const demoSnap = await adminDb.collection('agentProfiles').where('isDemoAccount', '==', true).get();
    const demoAgentIds = new Set(demoSnap.docs.map(d => String(d.data().agentId || d.id)));
    if (demoAgentIds.size > 0) {
      transactions = transactions.filter((t: any) => !demoAgentIds.has(String(t.agentId || '')));
    }

    // ── Resolve missing agentDisplayName from agentProfiles ──────────────
    // Some legacy transactions have agentId set to the agentProfile doc ID but
    // no agentDisplayName. Look up the profile and fill in the display name so
    // the ledger shows a name instead of a raw doc ID.
    try {
      // A display name looks like a raw Firestore doc ID if it's 20 chars, no spaces, mixed case
      const looksLikeDocId = (s: string) => /^[A-Za-z0-9]{15,30}$/.test(s) && !/\s/.test(s);
      const missingNameIds = Array.from(
        new Set(
          transactions
            .filter((t: any) => {
              const name = String(t.agentDisplayName || '').trim();
              return (!name || looksLikeDocId(name)) && t.agentId;
            })
            .map((t: any) => String(t.agentId))
        )
      );
      if (missingNameIds.length > 0) {
        // Batch-fetch profiles for all unique agentIds with missing display names
        const profileMap = new Map<string, string>(); // agentId → displayName
        await Promise.all(
          missingNameIds.map(async (agentId) => {
            try {
              const profileSnap = await adminDb.collection('agentProfiles').doc(agentId).get();
              if (profileSnap.exists) {
                const pd = profileSnap.data() || {};
                const name = pd.displayName || pd.name || [pd.firstName, pd.lastName].filter(Boolean).join(' ') || '';
                if (name) profileMap.set(agentId, name);
              }
            } catch { /* non-fatal */ }
          })
        );
        // Patch display names in-memory and write back to Firestore so future loads are fast
        transactions = transactions.map((t: any) => {
          const existingName = String(t.agentDisplayName || '').trim();
          if ((!existingName || looksLikeDocId(existingName)) && t.agentId && profileMap.has(String(t.agentId))) {
            const resolvedName = profileMap.get(String(t.agentId))!;
            // Write-back so the transaction doc has the name going forward (non-blocking)
            adminDb.collection('transactions').doc(t.id).update({ agentDisplayName: resolvedName }).catch(() => {});
            return { ...t, agentDisplayName: resolvedName };
          }
          return t;
        });
      }
    } catch { /* non-fatal — display name resolution is best-effort */ }

    // ── Inject agentCurrentSplitPct for active listing transactions ─────────
    // Active listings have no splitSnapshot (they haven't closed), so we look up
    // the agent's current commission plan split % and attach it so the ledger
    // can calculate estimated Net to Agent and Co. Retained.
    try {
      const activeListings = transactions.filter(
        (t: any) => t.status === 'active' && (t.closingType === 'listing' || t.closingType === 'dual') &&
        t.agentId && !t.splitSnapshot?.agentSplitPercent
      );
      if (activeListings.length > 0) {
        const uniqueAgentIds = Array.from(new Set(activeListings.map((t: any) => String(t.agentId))));
        const splitPctMap = new Map<string, number>(); // agentId → split %
        await Promise.all(
          uniqueAgentIds.map(async (agentId) => {
            try {
              // Strategy 1: direct doc lookup (works when agentId === profile doc ID)
              let pd: any = null;
              const directSnap = await adminDb.collection('agentProfiles').doc(agentId).get();
              if (directSnap.exists) {
                pd = directSnap.data() || {};
              } else {
                // Strategy 2: query by firebaseUid field (when agentId is a Firebase UID)
                const byUidSnap = await adminDb.collection('agentProfiles')
                  .where('firebaseUid', '==', agentId).limit(1).get();
                if (!byUidSnap.empty) {
                  pd = byUidSnap.docs[0].data() || {};
                } else {
                  // Strategy 3: query by agentId field
                  const byAgentIdSnap = await adminDb.collection('agentProfiles')
                    .where('agentId', '==', agentId).limit(1).get();
                  if (!byAgentIdSnap.empty) {
                    pd = byAgentIdSnap.docs[0].data() || {};
                  }
                }
              }
              if (!pd) return;
              // Try all known commission plan field paths
              const plan = pd.commissionPlan || pd.commission || pd.commissionStructure || pd;
              let splitPct: number | null = null;
              const planType = plan.planType || plan.type || pd.commissionMode || '';
              if (planType === 'flat') {
                splitPct = Number(plan.flatAgentPercent ?? plan.agentPercent ?? plan.agentSplitPercent ?? pd.flatAgentPercent ?? 0) || null;
              } else {
                // Tiered — use the first tier as the baseline estimate
                const tiers = plan.tiers || plan.commissionTiers || pd.tiers || [];
                if (tiers.length > 0) {
                  splitPct = Number(tiers[0].agentSplitPercent ?? tiers[0].agentPercent ?? 0) || null;
                }
                // Also try direct agentSplitPercent on profile as last resort
                if (!splitPct) splitPct = Number(pd.agentSplitPercent ?? pd.agentPercent ?? 0) || null;
              }
              if (splitPct && splitPct > 0) splitPctMap.set(agentId, splitPct);
            } catch { /* non-fatal */ }
          })
        );
        if (splitPctMap.size > 0) {
          transactions = transactions.map((t: any) => {
            if (
              t.status === 'active' &&
              (t.closingType === 'listing' || t.closingType === 'dual') &&
              t.agentId && splitPctMap.has(String(t.agentId))
            ) {
              return { ...t, agentCurrentSplitPct: splitPctMap.get(String(t.agentId)) };
            }
            return t;
          });
        }
      }
    } catch { /* non-fatal — split % injection is best-effort */ }

    transactions.sort((a: any, b: any) => {
      const da = a.createdAt ?? '';
      const db = b.createdAt ?? '';
      return da < db ? 1 : da > db ? -1 : 0;
    });

    return NextResponse.json({ ok: true, transactions });
  } catch (err: any) {
    console.error('[api/admin/transactions GET]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// Allowed fields that can be updated
const UPDATABLE_FIELDS = new Set([
  'agentId', 'agentDisplayName',
  'status', 'transactionType', 'closingType', 'dealType',
  'address', 'clientName', 'commission',
  'commissionPercent', 'commissionBasePrice', 'gci', 'transactionFee', 'earnestMoney',
  'depositHolder', 'depositHolderOther',
  'contractDate', 'closedDate', 'listingDate', 'projectedCloseDate',
  'optionExpiration', 'inspectionDeadline', 'surveyDeadline',
  'listPrice', 'salePrice', 'dealSource', 'notes', 'additionalComments',
  // Client contact
  'clientEmail', 'clientPhone', 'clientNewAddress', 'clientType',
  // Buyer info
  'buyerName', 'buyerEmail', 'buyerPhone',
  'buyer2Name', 'buyer2Email', 'buyer2Phone',
  // Seller info
  'sellerName', 'sellerEmail', 'sellerPhone',
  'seller2Name', 'seller2Email', 'seller2Phone',
  // Legacy second client
  'client2Name', 'client2Email', 'client2Phone',
  // Parties
  'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherBrokerage',
  'mortgageCompany', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone', 'lenderOffice',
  'titleCompany', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone',
  'titleAttorney', 'titleOffice',
  // TC
  'tcWorking',
  // Inspections
  'inspectionOrdered', 'targetInspectionDate', 'inspectionTypes',
  'tcScheduleInspections', 'tcScheduleInspectionsOther', 'inspectorName',
  // Commission paid by seller
  'sellerPayingListingAgent', 'sellerPayingListingAgentUnknown', 'sellerPayingBuyerAgent',
  // Buyer closing cost
  'buyerClosingCostTotal', 'buyerClosingCostAgentCommission', 'buyerClosingCostTxFee', 'buyerClosingCostHomeWarranty', 'buyerClosingCostOther',
  // Additional info
  'warrantyAtClosing', 'warrantyPaidBy',
  'txComplianceFee', 'txComplianceFeeAmount', 'txComplianceFeePaidBy',
  'txComplianceFeeAgentAllocation', 'txComplianceFeePrimaryAgentAmount', 'txComplianceFeeCoAgentAmount',
  'occupancyAgreement', 'occupancyDates',
  'shortageInCommission', 'shortageAmount', 'buyerBringToClosing',
  // Financial overrides
  'splitSnapshot', 'brokerProfit',
  // Split fields stored individually alongside splitSnapshot
  'agentPct', 'brokerPct', 'agentDollar', 'brokerGci',
  // Per-transaction commission override metadata
  // When commissionOverridden=true, rollup engine and TC approval skip
  // profile-based recalculation and use the saved split values directly.
  'commissionOverridden', 'commissionOverriddenBy', 'commissionOverriddenAt',
  // Extra buyers/sellers (3rd and 4th parties)
  'buyer3Name', 'buyer3Email', 'buyer3Phone',
  'buyer4Name', 'buyer4Email', 'buyer4Phone',
  'seller3Name', 'seller3Email', 'seller3Phone',
  'seller4Name', 'seller4Email', 'seller4Phone',
  // Uploaded documents (Purchase Agreement, Listing Paperwork, etc.)
  'documents',
  // Co-agent fields — allow adding/editing co-agent on any transaction including closed
  'hasCoAgent', 'coAgent', 'coAgentId', 'coAgentDisplayName', 'coAgentRole',
  'primaryAgentSplitPercent', 'coAgentSplitPercent', 'primaryAgentSideCredit', 'primaryAgentUnitCredit',
  'participantAllocations',
  // Outbound referral fee — paid to outside broker/relocation company off the top of GCI
  'outboundReferralFee', 'outboundReferralFeePercent', 'outboundReferralFeeDollar',
  // Pre-listing inspection
  'preListingInspectionOrdered', 'preListingTargetInspectionDate', 'preListingInspectionTypes',
  'preListingTcScheduleInspections', 'preListingTcScheduleInspectionsOther', 'preListingInspectorName',
  // Sign order
  'signOrderRequested', 'signServiceType', 'signInstallDate', 'signRider',
  'signAdditionalOptions', 'signOwnerName', 'signSpecialRequests',
  // ShowingTime
  'showingTimeRequested', 'showingNewOrChange', 'showingApptHandling', 'showingApptType',
  'showingApptOverlaps', 'showingAccessType', 'showingLockboxCode', 'showingAlarmCode',
  'showingDisarmCode', 'showingLeadTime', 'showingMaxApptLength', 'showingNoSameDayAppts',
  'showingShareAgentInfo', 'showingNotesToAgent', 'showingNotesToStaff',
  'showingCallOrder2Name', 'showingCallOrder2Mobile', 'showingCallOrder2Email',
  'showingCallOrder3Name', 'showingCallOrder3Mobile', 'showingCallOrder3Email',
  // MLS / listing
  'mlsDescription', 'listingExpirationDate',
  // Additional deadline fields
  'appraisalDeadline', 'titleDeadline', 'loanApplicationDeadline', 'finalLoanCommitmentDeadline',
  // Inbound referral
  'hasInboundReferral', 'inboundReferralAgentName', 'inboundReferralFeePercent', 'inboundReferralFeeDollar',
  // MLS number
  'mlsNumber',
  // Pass-through: agent personal property — no broker split, no leaderboard/tier credit
  'isPassThrough',
  // Unified-form fields previously omitted from this authoritative save route.
  // Keep the Admin Ledger, Staff Queue, TC Queue, and agent edit form aligned
  // with one transaction document and prevent silent field drops on save.
  'actualCloseDate', 'closingDate', 'finalLoanCommitment',
  'additionalNotes',
  'buyerCommissionPct', 'sellerCommissionPct',
  'isCoListing', 'coListingAgentName', 'coListingAgentBrokerage',
  'coListingAgentEmail', 'coListingAgentPhone', 'coListingAgentSplit',
  'isCommercial',
  'loanOfficeNumber', 'loanOfficerStreet',
  'mediaTypes', 'mediaRequested', 'mediaRequestedDate', 'mediaNotes',
  'occupancyDate', 'occupancyNotes',
  'outboundReferral', 'outboundReferralAgentName', 'outboundReferralBrokerage',
  'outboundReferralEmail', 'outboundReferralPhone',
  'inboundReferral', 'inboundReferralBrokerage', 'inboundReferralEmail',
  'inboundReferralFee', 'inboundReferralPhone',
  'shortageHandledBy',
  'showingAlarmArm', 'showingAlarmDisarm',
  'showingCallOrder1Name', 'showingCallOrder1Phone',
  'showingCallOrder2Phone', 'showingCallOrder3Phone',
  'showingLockboxLocation', 'showingLockboxType',
  'showingNotesToAgentOther', 'showingTimeId',
  'signNotes', 'signRequestedDate', 'signRiderExt',
  'titleOfficerStreet', 'warrantyAmount', 'workingWithTc',
  'inspectionRowData',
]);

export async function PATCH(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) return jsonError(400, 'Transaction id is required');

    // Build update payload from allowed fields only
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === 'id') continue;
      if (UPDATABLE_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    // An explicit "No" must remove every fee input from the transaction. This
    // prevents stale legacy dollar fields or split deductions from continuing to
    // reduce agent net after an authorized editor turns the fee off.
    if (String(updates.txComplianceFee || '').toLowerCase() === 'no' || updates.txComplianceFee === false) {
      updates.txComplianceFee = 'no';
      updates.txComplianceFeeAmount = 0;
      updates.txComplianceFeePaidBy = '';
      updates.txComplianceFeePrimaryAgentAmount = 0;
      updates.txComplianceFeeCoAgentAmount = 0;
      updates.transactionFee = 0;
    } else if (String(updates.txComplianceFee || '').toLowerCase() === 'yes' && updates.txComplianceFeeAmount !== undefined) {
      updates.transactionFee = Number(updates.txComplianceFeeAmount) || 0;
    }

    // closedDate is the canonical transaction-form field, while older ledger and
    // TC records can carry closingDate / actualCloseDate. Mirror any explicitly
    // supplied alias so the ledger overview and reopened unified form agree.
    const suppliedCloseDateKey = ['closedDate', 'closingDate', 'actualCloseDate']
      .find((key) => Object.prototype.hasOwnProperty.call(updates, key));
    if (suppliedCloseDateKey) {
      const normalizedCloseDate = updates[suppliedCloseDateKey] || '';
      updates.closedDate = normalizedCloseDate;
      updates.closingDate = normalizedCloseDate;
      updates.actualCloseDate = normalizedCloseDate;
    }

    // Normalize dealSource if present
    if (updates.dealSource) {
      updates.dealSource = normalizeDealSource(updates.dealSource) || updates.dealSource;
    }

    // Coerce empty-string numeric commission fields to null so they don't overwrite saved values
    for (const field of ['sellerPayingListingAgent', 'sellerPayingBuyerAgent', 'commissionPercent', 'listPrice', 'salePrice']) {
      if (field in updates && (updates[field] === '' || updates[field] === null || updates[field] === undefined)) {
        updates[field] = null;
      } else if (field in updates && updates[field] !== null) {
        const n = Number(updates[field]);
        if (!isNaN(n)) updates[field] = n;
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonError(400, 'No valid fields to update');
    }

    // Guard: temp_off_market cannot be set on closed listings
    if (updates.status === 'temp_off_market') {
      const existingDoc = await adminDb.collection('transactions').doc(id).get();
      if (existingDoc.exists) {
        const existing = existingDoc.data();
        if (existing?.status === 'closed') {
          return jsonError(400, 'Cannot set Temp Off Market on a closed listing');
        }
      }
    }

    // If status changed to closed and closedDate not provided, set it
    if (updates.status === 'closed' && !updates.closedDate) {
      const existingDoc = await adminDb.collection('transactions').doc(id).get();
      if (existingDoc.exists) {
        const existing = existingDoc.data();
        if (!existing?.closedDate) {
          updates.closedDate = new Date().toISOString().split('T')[0];
        }
      }
    }

    // If closedDate is explicitly cleared (empty string), null it out and recalculate year from contractDate
    if (updates.closedDate === '') {
      updates.closedDate = null;
      updates.closingDate = null;
      updates.actualCloseDate = null;
    }

    // Recalculate year if dates changed
    if (updates.closedDate || updates.contractDate) {
      const raw = updates.closedDate || updates.contractDate;
      if (raw) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          updates.year = d.getFullYear();
        }
      }
    } else if (updates.closedDate === null) {
      // closedDate was cleared — recalculate year from contractDate if available
      const existingForYear = await adminDb.collection('transactions').doc(id).get();
      const existingYearData = existingForYear.data() as any;
      const fallbackDate = updates.contractDate || existingYearData?.contractDate;
      if (fallbackDate) {
        const d = new Date(fallbackDate);
        if (!isNaN(d.getTime())) {
          updates.year = d.getFullYear();
        }
      }
    }

    // If splitSnapshot fields are provided individually, rebuild it
    // Merge any split fields present in the payload into splitSnapshot so the display
    // layer (which reads splitSnapshot) always reflects what was saved.
    // This covers: direct split edits from admin edit page, legacy agentNetCommission/companyRetained,
    // and the full splitSnapshot object sent by the admin edit form.
    const SPLIT_MERGE_FIELDS = ['agentPct', 'agentDollar', 'brokerPct', 'brokerGci',
      'agentNetCommission', 'companyRetained'];
    const hasSplitChange = SPLIT_MERGE_FIELDS.some(f => body[f] !== undefined) ||
      body.splitSnapshot !== undefined;
    if (hasSplitChange && !updates.splitSnapshot) {
      // Only do the merge if the form didn't already send a full splitSnapshot object
      const existingDoc2 = await adminDb.collection('transactions').doc(id).get();
      const existing2 = existingDoc2.exists ? existingDoc2.data() : {};
      const currentSplit = (existing2 as any)?.splitSnapshot || {};
      updates.splitSnapshot = {
        ...currentSplit,
        ...(body.agentPct !== undefined ? { agentSplitPercent: Number(body.agentPct) } : {}),
        ...(body.agentDollar !== undefined ? { agentNetCommission: Number(body.agentDollar) } : {}),
        ...(body.brokerPct !== undefined ? { companySplitPercent: Number(body.brokerPct) } : {}),
        ...(body.brokerGci !== undefined ? { companyRetained: Number(body.brokerGci) } : {}),
        // Legacy field names (kept for backward compat)
        ...(body.agentNetCommission !== undefined ? { agentNetCommission: Number(body.agentNetCommission) } : {}),
        ...(body.companyRetained !== undefined ? { companyRetained: Number(body.companyRetained) } : {}),
        // The unified edit form stores the gross amount in `gci`; legacy pages use
        // `commission`. Keep the snapshot aligned with either source.
        ...(updates.gci !== undefined ? { grossCommission: Number(updates.gci) } : {}),
        ...(updates.commission !== undefined ? { grossCommission: Number(updates.commission) } : {}),
      };
    }

    // Keep dealType and transactionType in sync — both fields are used by different parts of the app
    if (updates.dealType && !updates.transactionType) {
      updates.transactionType = updates.dealType;
    } else if (updates.transactionType && !updates.dealType) {
      updates.dealType = updates.transactionType;
    }

    // Capture existing state BEFORE update so we can rebuild old rollups if needed
    const existingSnap = await adminDb.collection('transactions').doc(id).get();
    const existingData = existingSnap.data() as any;
    if (!existingSnap.exists) return jsonError(404, 'Transaction not found');

    // Preserve one shared transaction document for co-agents. The helper updates
    // participant allocations only; it never creates replacement files or deletes
    // the original transaction used by TC/Staff links and documents.
    const allocationSource = { ...existingData, ...updates };
    if (allocationSource.hasCoAgent && allocationSource.coAgent?.agentId) {
      try {
        Object.assign(updates, await buildCoAgentAllocationUpdate(adminDb, allocationSource));
      } catch (allocationErr: any) {
        console.warn('[api/admin/transactions PATCH] Co-agent allocation refresh failed; preserving existing allocation:', allocationErr?.message);
      }
    } else if (updates.hasCoAgent === false) {
      // An intentional removal must clear every canonical and legacy alias.
      // Otherwise the unified form rehydrates the relationship from a stale ID
      // or display name on the next load.
      updates.coAgent = null;
      updates.coAgentId = '';
      updates.coAgentDisplayName = '';
      updates.coAgentRole = '';
      updates.coAgentSplitPercent = '';
      updates.primaryAgentSplitPercent = '';
      updates.isCoListing = false;
      updates.coListingAgentName = '';
      updates.coListingAgentEmail = '';
      updates.coListingAgentBrokerage = '';
      updates.coListingAgentPhone = '';
      updates.coListingAgentSplit = '';
      updates.participantAllocations = null;
      updates.primaryAgentSideCredit = null;
      updates.primaryAgentUnitCredit = null;
    }

    // If agentId is changing (transfer), capture the old agentId
    let oldAgentId: string | null = null;
    if (updates.agentId && existingData?.agentId && existingData.agentId !== updates.agentId) {
      oldAgentId = String(existingData.agentId).trim();
    }

    // If the year is changing (e.g. closedDate moved from 2024 → 2025), capture the old year
    // so we can rebuild both the old and new year rollups
    let oldYear: number | null = null;
    if (updates.year) {
      const existingYear = Number(
        existingData?.year ??
        (existingData?.closedDate ? new Date(existingData.closedDate).getFullYear() : null) ??
        (existingData?.contractDate ? new Date(existingData.contractDate).getFullYear() : null)
      );
      if (existingYear && existingYear !== updates.year) {
        oldYear = existingYear;
      }
    }

    updates.updatedAt = new Date();
    await adminDb.collection('transactions').doc(id).update(updates);
    // Fetch the updated doc to return
    const updatedSnap = await adminDb.collection('transactions').doc(id).get();
    const updated = serializeFirestore({ id: updatedSnap.id, ...updatedSnap.data() });

    // ── TC Queue recovery ──────────────────────────────────────────────────
    // All operational editors (admin, staff, TC, and an admin impersonating an
    // agent) save through this route. A TC-managed Pending file must therefore
    // have an active intake even when the save did not travel through the agent
    // PATCH route. Keep the queue as a workflow index that points back to this
    // same canonical transaction document; never create a second transaction.
    try {
      const txForTcQueue = updatedSnap.data() as any;
      const isTcYes = (value: unknown) => value === true || String(value ?? '').trim().toLowerCase() === 'yes';
      const isTcManaged = isTcYes(txForTcQueue?.workingWithTc) || isTcYes(txForTcQueue?.tcWorking);
      const isPendingForTc = ['pending', 'under_contract'].includes(
        String(txForTcQueue?.status || '').trim().toLowerCase(),
      );

      if (isTcManaged && isPendingForTc) {
        const linkedIntakes = await adminDb
          .collection('tcIntakes')
          .where('approvedTransactionId', '==', id)
          .get();
        const activeIntake = linkedIntakes.docs.find((doc) => {
          const intakeStatus = String(doc.data().status || '').trim().toLowerCase();
          return intakeStatus === 'submitted' || intakeStatus === 'in_review';
        });

        if (activeIntake) {
          // Heal a stale/missing pointer without changing the TC's workflow state.
          // Older recovery records may not have received their checklist when a
          // previous best-effort write failed. Repair that workflow-only state.
          await ensureTcChecklist(adminDb, activeIntake.id);
          if (txForTcQueue?.tcIntakeId !== activeIntake.id || txForTcQueue?.workingWithTc !== true) {
            await adminDb.collection('transactions').doc(id).update({
              tcIntakeId: activeIntake.id,
              workingWithTc: true,
              updatedAt: new Date(),
            });
          }
        } else {
          const nowIso = new Date().toISOString();
          // Create the intake and checklist in one batch using the transaction ID
          // as the deterministic intake ID. Parallel saves cannot produce two
          // submitted records for the same transaction.
          const intakeRef = await createTcIntakeWithChecklist(adminDb, id, {
            // Workflow state. The transaction's status remains authoritative for
            // the deal; this status only controls the TC work queue.
            status: 'submitted',
            listingStatus: 'pending',
            submittedAt: nowIso,
            updatedAt: nowIso,
            submittedBy: decoded.uid,
            submittedByUid: decoded.uid,
            isResubmission: true,
            originalTransactionId: id,
            transactionId: id,
            approvedTransactionId: id,

            // Queue-list fields. Detail editing reopens the transaction above.
            agentId: txForTcQueue?.agentId || null,
            agentDisplayName: txForTcQueue?.agentDisplayName || '',
            address: txForTcQueue?.address || txForTcQueue?.propertyAddress || null,
            propertyAddress: txForTcQueue?.propertyAddress || txForTcQueue?.address || null,
            closingType: txForTcQueue?.closingType || null,
            dealType: txForTcQueue?.dealType || txForTcQueue?.transactionType || null,
            transactionType: txForTcQueue?.transactionType || txForTcQueue?.dealType || null,
            clientName: txForTcQueue?.clientName || txForTcQueue?.buyerName || txForTcQueue?.sellerName || '',
            listPrice: txForTcQueue?.listPrice ?? null,
            salePrice: txForTcQueue?.salePrice ?? null,
            commissionPercent: txForTcQueue?.commissionPercent ?? null,
            gci: txForTcQueue?.gci ?? null,
            contractDate: txForTcQueue?.contractDate ?? null,
            closingDate: txForTcQueue?.closingDate ?? txForTcQueue?.closedDate ?? null,
            documents: Array.isArray(txForTcQueue?.documents) ? txForTcQueue.documents : [],
          });

          await adminDb.collection('transactions').doc(id).update({
            tcIntakeId: intakeRef.id,
            workingWithTc: true,
            updatedAt: new Date(),
          });
        }
      }
    } catch (tcQueueErr: any) {
      // A queue-index failure must not discard a valid transaction edit. Log it
      // loudly so it can be repaired without risking the transaction record.
      console.error('[api/admin/transactions PATCH] TC queue recovery failed:', tcQueueErr?.message || tcQueueErr);
    }

    // Rebuild rollup(s) so leaderboards, agent dashboard, TV mode, and reporting stay in sync
    try {
      const txData = updatedSnap.data() as any;
      const agentId = String(txData?.agentId || '').trim();
      const txYear = Number(txData?.year || updates.year || new Date().getFullYear());

      if (agentId && txYear) {
        // Rebuild new year's rollup for current agent
        await rebuildAgentRollup(adminDb, agentId, txYear);
        // If the year changed, also rebuild the OLD year's rollup so it no longer counts this tx
        if (oldYear && oldYear !== txYear) {
          await rebuildAgentRollup(adminDb, agentId, oldYear);
        }
      }
      const coAgentId = String(txData?.coAgent?.agentId || '').trim();
      if (coAgentId && txYear) {
        await rebuildAgentRollup(adminDb, coAgentId, txYear);
        if (oldYear && oldYear !== txYear) await rebuildAgentRollup(adminDb, coAgentId, oldYear);
      }
      // If agent changed (transfer), rebuild the OLD agent's rollup for both old and new year
      if (oldAgentId) {
        await rebuildAgentRollup(adminDb, oldAgentId, txYear);
        if (oldYear && oldYear !== txYear) {
          await rebuildAgentRollup(adminDb, oldAgentId, oldYear);
        }
      }
    } catch (rollupErr: any) {
      console.warn('[api/admin/transactions PATCH] Rollup rebuild failed (non-fatal):', rollupErr?.message);
    }

    // ── Staff Queue dispatch on status change (admin-side) ─────────────────
    // Mirror the same logic as the agent PATCH route so staff/TC are always
    // notified regardless of which route triggers the status change.
    try {
      const txDataForQueue = updatedSnap.data() as any;
      const newStatusForQueue = updates.status;
      const previousStatusForQueue = existingData?.status;
      if (newStatusForQueue && newStatusForQueue !== previousStatusForQueue) {
        const LISTING_CLOSING_TYPES = new Set(['listing', 'dual', 'listing_only', 'seller']);
        const LISTING_STATUS_TRIGGERS = new Set(['active', 'pending', 'coming_soon', 'temp_off_market', 'canceled', 'expired', 'closed', 'back_on_market']);
        const BUYER_STATUS_TRIGGERS = new Set(['closed']);
        const txClosingTypeQ = String(txDataForQueue?.closingType || txDataForQueue?.transactionType || '');
        const isListingTxQ = LISTING_CLOSING_TYPES.has(txClosingTypeQ);
        const triggerSetQ = isListingTxQ ? LISTING_STATUS_TRIGGERS : BUYER_STATUS_TRIGGERS;
        if (triggerSetQ.has(newStatusForQueue)) {
          const agentProfileQ = await adminDb.collection('agentProfiles').doc(txDataForQueue?.agentId || '').get().catch(() => null);
          const agentNameQ = agentProfileQ?.data()?.displayName || txDataForQueue?.agentDisplayName || 'Unknown Agent';
          const staffQueueItem: Record<string, any> = {
            transactionId: id,
            tcIntakeId: null,
            agentId: txDataForQueue?.agentId || '',
            agentName: agentNameQ,
            submittedBy: decoded.uid,
            submittedByName: agentNameQ,
            actionType: newStatusForQueue === 'closed' && !isListingTxQ ? 'closed_buyer' : 'status_change',
            closingType: txClosingTypeQ || null,
            previousStatus: previousStatusForQueue,
            newStatus: newStatusForQueue,
            notes: txDataForQueue?.notes || null,
            tcWorking: !!txDataForQueue?.workingWithTc,
            status: 'pending_review',
            reviewedBy: null,
            reviewedByName: null,
            reviewedAt: null,
            staffNotes: null,
            address: txDataForQueue?.propertyAddress || txDataForQueue?.address || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await adminDb.collection('staffQueue').add(staffQueueItem);
        }
      }
    } catch (queueErr: any) {
      console.warn('[api/admin/transactions PATCH] Staff queue dispatch failed (non-fatal):', queueErr?.message);
    }

    // ── Notifications: status changes and edits ──────────────────────────
    try {
      const txData = updatedSnap.data() as any;
      const agentIdSlug = String(txData?.agentId || '').trim();
      const address = String(txData?.address || txData?.propertyAddress || 'your transaction').trim();
      const newStatus = updates.status;
      const statusChanged = newStatus && existingData?.status !== newStatus;

      // ── Staff & TC notifications on status change (admin-side) ───────────
      if (statusChanged) {
        const STATUS_LABELS: Record<string, string> = {
          active: 'Active', pending: 'Pending', closed: 'Closed', canceled: 'Canceled',
          coming_soon: 'Coming Soon', temp_off_market: 'Temporarily Off Market',
          back_on_market: 'Back on Market', expired: 'Expired',
        };
        const prevLabel = STATUS_LABELS[existingData?.status ?? ''] ?? existingData?.status ?? 'Unknown';
        const newLabel = STATUS_LABELS[newStatus] ?? newStatus;
        const agentNameForNotif = txData?.agentDisplayName || agentIdSlug || 'Agent';
        const staffBody = `${agentNameForNotif} — ${address} changed from ${prevLabel} to ${newLabel}.`;
        // Notify all staff
        const allStaffUids = await getAllStaffUids(adminDb);
        if (allStaffUids.length > 0) {
          await sendNotification(adminDb, {
            type: 'staff_queue_new',
            recipientUids: allStaffUids,
            title: 'Transaction Status Updated',
            body: staffBody,
            url: '/dashboard/admin/staff-queue',
            data: { transactionId: id },
          });
        }
        // Notify TC if transaction is TC-managed
        const isTcManagedAdmin = !!(txData?.workingWithTc || txData?.tcIntakeId);
        if (isTcManagedAdmin) {
          const tcUidsAdmin = await getTcUids(adminDb);
          const staffSet = new Set(allStaffUids);
          const tcOnlyAdmin = tcUidsAdmin.filter(u => !staffSet.has(u));
          if (tcOnlyAdmin.length > 0) {
            await sendNotification(adminDb, {
              type: 'tx_status_change',
              recipientUids: tcOnlyAdmin,
              title: 'Transaction Status Updated',
              body: staffBody,
              url: '/dashboard/admin/tc',
              data: { transactionId: id },
            });
          }
        }
      }
      // Resolve the agent's Firebase UID from the agentId slug
      const agentUid = agentIdSlug ? (await getAgentUid(adminDb, agentIdSlug)) : null;
      // Determine who made this edit (TC/staff vs agent)
      const callerUid = decoded.uid;
      const callerRole = await getStaffRole(callerUid);
      const callerIsTcOrStaff = callerRole !== null; // any staffUsers role
      const callerIsAgent = !callerIsTcOrStaff;

      // ── Agent notification: TC/staff updated their transaction ──────────────
      // Only fire if the caller is TC or staff (not the agent themselves)
      if (agentUid && callerIsTcOrStaff) {
        // Load agent's txNotificationPrefs
        const agentUserDoc = await adminDb.collection('users').doc(agentUid).get();
        const agentTxPrefs = agentUserDoc.exists
          ? (agentUserDoc.data()?.txNotificationPrefs?.agentOnTcUpdate ?? { granularity: 'significant', in_app: true, email: true, sms: false })
          : { granularity: 'significant', in_app: true, email: true, sms: false };
        const granularity: string = agentTxPrefs.granularity ?? 'significant';
        // Decide whether to send based on granularity
        const shouldNotifyAgent = granularity === 'all' || (granularity === 'significant' && statusChanged);
        if (shouldNotifyAgent) {
          const statusLabels: Record<string, string> = {
            active: 'Active', pending: 'Pending', closed: 'Closed',
            coming_soon: 'Coming Soon', temp_off_market: 'Temp Off Market',
            canceled: 'Canceled', expired: 'Expired',
          };
          const changeDesc = statusChanged
            ? `Status changed from ${statusLabels[existingData?.status] ?? existingData?.status} to ${statusLabels[newStatus] ?? newStatus}`
            : 'Transaction details were updated by TC/staff';
          await sendNotification(adminDb, {
            type: 'tx_status_change',
            recipientUids: [agentUid],
            title: statusChanged ? `Transaction Status Updated` : `Transaction Updated`,
            body: `${address}: ${changeDesc}.`,
            url: '/dashboard/transactions',
            channels: {
              in_app: agentTxPrefs.in_app !== false,
              email: agentTxPrefs.email !== false,
              sms: agentTxPrefs.sms === true,
            },
          });
        }
      }

      // ── TC notification: agent edited a transaction they are working ─────────
      // Only fire if the caller is the agent (not TC/staff) and transaction has a TC
      const hasTcIntake = !!(txData?.tcIntakeId || txData?.workingWithTc);
      if (callerIsAgent && hasTcIntake) {
        // Find the assigned TC: prefer tcIntakeId → look up the intake doc for the assigned TC UID
        // Fall back to all TCs if no specific assignment found
        let assignedTcUids: string[] = [];
        if (txData?.tcIntakeId) {
          try {
            const intakeSnap = await adminDb.collection('tcIntakes').doc(txData.tcIntakeId).get();
            if (intakeSnap.exists) {
              const assignedTcUid = intakeSnap.data()?.assignedTcUid || intakeSnap.data()?.tcUid;
              if (assignedTcUid) assignedTcUids = [assignedTcUid];
            }
          } catch { /* ignore */ }
        }
        if (assignedTcUids.length === 0) {
          // Fall back to all active TCs
          assignedTcUids = await getTcUids(adminDb);
        }
        // For each TC, check their txNotificationPrefs
        for (const tcUid of assignedTcUids) {
          const tcUserDoc = await adminDb.collection('users').doc(tcUid).get();
          const tcTxPrefs = tcUserDoc.exists
            ? (tcUserDoc.data()?.txNotificationPrefs?.tcOnAgentEdit ?? { in_app: true, email: true, sms: false })
            : { in_app: true, email: true, sms: false };
          const changeDesc = statusChanged
            ? `Status changed to ${updates.status}`
            : 'Transaction details were updated by the agent';
          await sendNotification(adminDb, {
            type: 'tx_status_change',
            recipientUids: [tcUid],
            title: 'Transaction Updated by Agent',
            body: `${address}: ${changeDesc}.`,
            url: '/dashboard/admin/transactions',
            channels: {
              in_app: tcTxPrefs.in_app !== false,
              email: tcTxPrefs.email !== false,
              sms: tcTxPrefs.sms === true,
            },
          });
        }
      }
    } catch (notifErr: any) {
      console.warn('[api/admin/transactions] Notification trigger failed (non-fatal):', notifErr?.message);
    }
    // Closed co-agent files remain on this same transaction ID. The allocation
    // record above provides each agent's volume, net, fee, and unit credit.

    // ── Retroactive referral fee recalculation ─────────────────────────────────────────
    // When a referral fee is added/changed on a closed transaction, recalculate the
    // agent's commission using the net-after-referral GCI and update the splitSnapshot.
    // Rollup is already rebuilt above so it will pick up the new splitSnapshot values.
    // SKIP if the admin has manually overridden the commission split — preserve their values.
    const referralChanged = updates.outboundReferralFee !== undefined;
    const isCommissionOverridden = updates.commissionOverridden === true || existingData?.commissionOverridden === true;
    // Only recalculate if the referral fee actually changed from the stored value
    const existingReferralPct = Number(existingData?.outboundReferralFee?.referralPercent ?? 0);
    const newReferralPct = updates.outboundReferralFee ? Number(updates.outboundReferralFee.referralPercent ?? 0) : existingReferralPct;
    const referralActuallyChanged = referralChanged && (newReferralPct !== existingReferralPct);
    if (referralActuallyChanged && !isCommissionOverridden) {
      try {
        const txData = updatedSnap.data() as any;
        const agentId = String(txData?.agentId || '').trim();
        const agentDisplayName = String(txData?.agentDisplayName || '').trim();
        const txStatus = String(txData?.status || '').trim();
        const referralFee = txData?.outboundReferralFee as Record<string, any> | null;
        const referralPct = referralFee ? Number(referralFee.referralPercent ?? 0) : 0;
        const grossGci = Number(txData?.gci ?? txData?.commission ?? txData?.splitSnapshot?.grossCommission ?? 0);

        if (agentId && grossGci > 0 && txStatus === 'closed') {
          const calc = await resolveTransactionCalculation({
            agentId,
            agentDisplayName,
            commission: grossGci,
            referralFeePercent: referralPct > 0 ? referralPct : null,
            transactionDate: txData?.closedDate || txData?.contractDate || null,
          });
          const newSplitSnapshot = {
            ...(txData?.splitSnapshot || {}),
            ...calc.splitSnapshot,
          };
          await adminDb.collection('transactions').doc(id).update({
            splitSnapshot: newSplitSnapshot,
            commission: grossGci,
            updatedAt: new Date(),
          });
          // Rebuild rollup with updated splitSnapshot
          const txYear = Number(txData?.year || new Date().getFullYear());
          await rebuildAgentRollup(adminDb, agentId, txYear);
          console.log(`[api/admin/transactions] Referral fee recalculation complete for ${id}`);
        }
      } catch (referralErr: any) {
        console.warn('[api/admin/transactions] Referral fee recalculation failed (non-fatal):', referralErr?.message);
      }
    }

    return NextResponse.json({ ok: true, transaction: updated });
  } catch (err: any) {
    console.error('[api/admin/transactions PATCH]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) return jsonError(400, 'Transaction id is required');

    // Verify it exists
    const doc = await adminDb.collection('transactions').doc(id).get();
    if (!doc.exists) return jsonError(404, 'Transaction not found');

    // Capture agentId + year before deleting
    const txData = doc.data() as any;
    const agentId = String(txData?.agentId || '').trim();
    const txYear = Number(txData?.year || new Date().getFullYear());

    await adminDb.collection('transactions').doc(id).delete();

    // Rebuild rollup so leaderboards reflect the deletion
    try {
      if (agentId && txYear) {
        await rebuildAgentRollup(adminDb, agentId, txYear);
      }
    } catch (rollupErr: any) {
      console.warn('[api/admin/transactions DELETE] Rollup rebuild failed (non-fatal):', rollupErr?.message);
    }

    return NextResponse.json({ ok: true, deleted: id });
  } catch (err: any) {
    console.error('[api/admin/transactions DELETE]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
