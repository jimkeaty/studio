// GET /api/admin/transactions — returns all transactions for admin ledger
// PATCH /api/admin/transactions — update a single transaction by id
// DELETE /api/admin/transactions — delete a single transaction by id
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import { normalizeDealSource } from '@/lib/normalizeDealSource';
import { splitCoAgentTransaction } from '@/lib/transactions/splitCoAgentTransaction';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getTcUids, getAgentUid } from '@/lib/notifications/getRecipientUids';

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
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
              const profileSnap = await adminDb.collection('agentProfiles').doc(agentId).get();
              if (!profileSnap.exists) return;
              const pd = profileSnap.data() || {};
              const plan = pd.commissionPlan || pd.commission || pd.commissionStructure;
              if (!plan) return;
              let splitPct: number | null = null;
              if (plan.planType === 'flat' || plan.type === 'flat') {
                splitPct = Number(plan.flatAgentPercent ?? plan.agentPercent ?? plan.agentSplitPercent ?? 0) || null;
              } else {
                // Tiered — use the first tier as the baseline estimate
                const tiers = plan.tiers || plan.commissionTiers || [];
                if (tiers.length > 0) {
                  splitPct = Number(tiers[0].agentSplitPercent ?? tiers[0].agentPercent ?? 0) || null;
                }
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
  'address', 'clientName', 'dealValue', 'commission',
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
  'hasCoAgent', 'coAgent',
  // Outbound referral fee — paid to outside broker/relocation company off the top of GCI
  'outboundReferralFee',
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
    if (body.agentNetCommission !== undefined || body.companyRetained !== undefined) {
      const existingDoc = await adminDb.collection('transactions').doc(id).get();
      const existing = existingDoc.exists ? existingDoc.data() : {};
      const currentSplit = existing?.splitSnapshot || {};

      updates.splitSnapshot = {
        ...currentSplit,
        ...(body.agentNetCommission !== undefined ? { agentNetCommission: Number(body.agentNetCommission) } : {}),
        ...(body.companyRetained !== undefined ? { companyRetained: Number(body.companyRetained) } : {}),
        ...(updates.commission !== undefined ? { grossCommission: Number(updates.commission) } : {}),
      };
    }

    // Keep dealType and transactionType in sync — both fields are used by different parts of the app
    if (updates.dealType && !updates.transactionType) {
      updates.transactionType = updates.dealType;
    } else if (updates.transactionType && !updates.dealType) {
      updates.dealType = updates.transactionType;
    }

    // Keep dealValue in sync with salePrice — broker command metrics reads dealValue for volume charts.
    // When salePrice is edited, dealValue must also be updated or the old value persists in charts.
    if (updates.salePrice !== undefined) {
      const sp = Number(updates.salePrice);
      if (!isNaN(sp) && sp > 0) {
        updates.dealValue = sp;
      }
    }

    // Capture existing state BEFORE update so we can rebuild old rollups if needed
    const existingSnap = await adminDb.collection('transactions').doc(id).get();
    const existingData = existingSnap.data() as any;

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

    // ── Notifications: status changes and edits ──────────────────────────
    try {
      const txData = updatedSnap.data() as any;
      const agentIdSlug = String(txData?.agentId || '').trim();
      const address = String(txData?.address || txData?.propertyAddress || 'your transaction').trim();
      const newStatus = updates.status;
      const statusChanged = newStatus && existingData?.status !== newStatus;
      // Resolve the agent's Firebase UID from the agentId slug
      const agentUid = agentIdSlug ? (await getAgentUid(adminDb, agentIdSlug)) : null;
      // Status change → notify agent
      if (agentUid && statusChanged) {
        const statusLabels: Record<string, string> = {
          active: 'Active', pending: 'Pending', closed: 'Closed',
          coming_soon: 'Coming Soon', temp_off_market: 'Temp Off Market',
          canceled: 'Canceled', expired: 'Expired',
        };
        const fromLabel = statusLabels[existingData?.status] ?? existingData?.status ?? 'Unknown';
        const toLabel = statusLabels[newStatus] ?? newStatus;
        await sendNotification(adminDb, {
          type: 'tx_status_change',
          recipientUids: [agentUid],
          title: `Transaction Status Updated: ${toLabel}`,
          body: `${address} has been updated from ${fromLabel} to ${toLabel}.`,
          url: '/dashboard/transactions',
        });
      }

      // Any edit (not just status) → notify TC so they stay in sync
      if (agentIdSlug) {
        const tcUids = await getTcUids(adminDb);
        if (tcUids.length > 0) {
          const changeDesc = statusChanged
            ? `Status changed to ${updates.status}`
            : 'Transaction details were updated';
          await sendNotification(adminDb, {
            type: 'tx_status_change',
            recipientUids: tcUids,
            title: 'Transaction Updated',
            body: `${address}: ${changeDesc}.`,
            url: '/dashboard/admin/transactions',
          });
        }
      }
    } catch (notifErr: any) {
      console.warn('[api/admin/transactions] Notification trigger failed (non-fatal):', notifErr?.message);
    }
    // ── Co-agent split on close ─────────────────────────────────────────────
    // Case 1: Transaction is being marked closed NOW and has a co-agent → split
    // Case 2: Transaction is ALREADY closed and co-agent is being added retroactively → split
    const isClosingNow = updates.status === 'closed' && existingData?.status !== 'closed';
    const isRetroCoAgent = updates.hasCoAgent === true && existingData?.status === 'closed' && !existingData?.hasCoAgent;
    if (isClosingNow || isRetroCoAgent) {
      const txData = updatedSnap.data() as any;
      if (txData?.hasCoAgent && txData?.coAgent?.agentId && txData?.source !== 'co_agent_split') {
        try {
          const splitResult = await splitCoAgentTransaction(id);
          if (splitResult) {
            return NextResponse.json({
              ok: true,
              split: true,
              primaryTransactionId: splitResult.primaryTransactionId,
              coAgentTransactionId: splitResult.coAgentTransactionId,
            });
          }
        } catch (splitErr: any) {
          console.warn('[api/admin/transactions] Co-agent split failed (non-fatal):', splitErr?.message);
        }
      }
    }

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
