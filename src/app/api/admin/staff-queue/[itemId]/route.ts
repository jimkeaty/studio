// GET    /api/admin/staff-queue/[itemId] — fetch a single staff queue item + checklist + activity log
// PATCH  /api/admin/staff-queue/[itemId] — update, complete, dismiss, archive, remove, reopen, checklist, assignment
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getAgentUid } from '@/lib/notifications/getRecipientUids';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import { resolveGCI } from '@/lib/commissions';

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) out[k] = serializeFirestore(v);
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

// All transaction fields staff can edit from the Staff Queue detail page
const EDITABLE_TX_FIELDS = new Set([
  'status', 'address', 'propertyAddress', 'closingType', 'dealType', 'dealSource',
  'clientName', 'clientEmail', 'clientPhone', 'clientNewAddress',
  'client2Name', 'client2Email', 'client2Phone',
  'buyerName', 'buyerEmail', 'buyerPhone', 'buyer2Name', 'buyer2Email', 'buyer2Phone',
  'buyer3Name', 'buyer3Email', 'buyer3Phone', 'buyer4Name', 'buyer4Email', 'buyer4Phone',
  'sellerName', 'sellerEmail', 'sellerPhone', 'seller2Name', 'seller2Email', 'seller2Phone',
  'seller3Name', 'seller3Email', 'seller3Phone', 'seller4Name', 'seller4Email', 'seller4Phone',
  'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherBrokerage',
  'listPrice', 'salePrice', 'dealValue', 'commissionPercent', 'gci', 'transactionFee',
  'brokerPct', 'brokerGci', 'agentPct', 'agentDollar', 'earnestMoney',
  'listingDate', 'contractDate', 'closedDate', 'projectedCloseDate',
  'optionExpiration', 'inspectionDeadline', 'surveyDeadline',
  'loanApplicationDeadline', 'appraisalDeadline', 'titleDeadline', 'finalLoanCommitmentDeadline',
  'mortgageCompany', 'lenderOffice', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone',
  'titleCompany', 'titleOffice', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone', 'titleAttorney',
  'txComplianceFee', 'txComplianceFeeAmount', 'txComplianceFeePaidBy',
  'notes', 'additionalComments', 'staffNotes',
]);

// Fields that trigger a commission recalculation when changed
const COMMISSION_TRIGGER_FIELDS = new Set([
  'salePrice', 'commissionPercent', 'gci', 'commission', 'commissionBasePrice',
]);

// Default checklist items seeded for new staff queue items (mirrors TC queue checklist)
const DEFAULT_CHECKLIST = [
  { id: 'sq_01', order: 1, label: 'Review transaction details' },
  { id: 'sq_02', order: 2, label: 'Verify agent and client information' },
  { id: 'sq_03', order: 3, label: 'Confirm property address' },
  { id: 'sq_04', order: 4, label: 'Check MLS status update' },
  { id: 'sq_05', order: 5, label: 'Review financial details' },
  { id: 'sq_06', order: 6, label: 'Update transaction ledger' },
  { id: 'sq_07', order: 7, label: 'Notify relevant parties' },
  { id: 'sq_08', order: 8, label: 'File any required documents' },
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden: Staff only');

    const itemRef = adminDb.collection('staffQueue').doc(itemId);
    const doc = await itemRef.get();
    if (!doc.exists) return jsonError(404, 'Staff queue item not found');

    const item = serializeFirestore(doc.data());

    // Fetch linked transaction
    let transaction = null;
    if (item.transactionId) {
      const txDoc = await adminDb.collection('transactions').doc(item.transactionId).get();
      if (txDoc.exists) {
        transaction = serializeFirestore(txDoc.data());
        transaction.id = txDoc.id;
        // Backfill address on the queue item if missing
        if (!item.address && !item.transactionAddress) {
          const resolvedAddress = transaction.propertyAddress || transaction.address || null;
          if (resolvedAddress) {
            await itemRef.update({ address: resolvedAddress, transactionAddress: resolvedAddress });
            item.address = resolvedAddress;
            item.transactionAddress = resolvedAddress;
          }
        }
      }
    }

    // Fetch linked TC intake (for new_listing items that don't have a transaction yet)
    let tcIntake: any = null;
    let intakeDocuments: any[] = [];
    const tcIntakeId = item.tcIntakeId || null;
    if (tcIntakeId) {
      try {
        const intakeDoc = await adminDb.collection('tcIntakes').doc(tcIntakeId).get();
        if (intakeDoc.exists) {
          tcIntake = serializeFirestore(intakeDoc.data());
          tcIntake.id = intakeDoc.id;
          if (Array.isArray(tcIntake.documents)) {
            intakeDocuments = tcIntake.documents;
          }
          // Backfill address on queue item if missing
          if (!item.address && !item.transactionAddress) {
            const resolvedAddress = (tcIntake.address || tcIntake.propertyAddress || '').trim();
            if (resolvedAddress) {
              await itemRef.update({ address: resolvedAddress, transactionAddress: resolvedAddress }).catch(() => {});
              item.address = resolvedAddress;
              item.transactionAddress = resolvedAddress;
            }
          }
        }
      } catch {
        // Non-fatal: intake may not exist
      }
    }
    // Merge documents: transaction docs + intake docs (deduplicated by url)
    const txDocs: any[] = transaction?.documents || [];
    const allDocUrls = new Set(txDocs.map((d: any) => d.url));
    const mergedDocuments = [
      ...txDocs,
      ...intakeDocuments.filter((d: any) => d.url && !allDocUrls.has(d.url)),
    ];

    // Fetch checklist subcollection — seed defaults if empty
    const checklistSnap = await itemRef.collection('checklist').orderBy('order', 'asc').get();
    let checklist: any[] = [];
    if (checklistSnap.empty) {
      const now = new Date().toISOString();
      const batch = adminDb.batch();
      for (const ci of DEFAULT_CHECKLIST) {
        const ref = itemRef.collection('checklist').doc(ci.id);
        const data = { ...ci, completed: false, completedBy: null, completedAt: null, createdAt: now };
        batch.set(ref, data);
        checklist.push({ ...data, id: ci.id });
      }
      await batch.commit();
    } else {
      checklist = checklistSnap.docs.map(d => ({ id: d.id, ...serializeFirestore(d.data()) }));
    }

    // Fetch activity log subcollection
    const activitySnap = await itemRef.collection('activityLog')
      .orderBy('timestamp', 'asc')
      .get();
    const activityLog = activitySnap.docs.map(d => serializeFirestore(d.data()));

    // Fetch staff profiles for assignment dropdown
    const staffSnap = await adminDb.collection('staffUsers')
      .where('status', '==', 'active')
      .get();
    const staffProfiles = staffSnap.docs.map(d => ({
      id: d.id,
      ...serializeFirestore(d.data()),
    }));

    return NextResponse.json({
      ok: true,
      item: { id: doc.id, ...item },
      transaction,
      tcIntake,
      documents: mergedDocuments,
      checklist,
      activityLog,
      staffProfiles,
    });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden: Staff only');

    const body = await req.json();
    const {
      action,
      txUpdates,
      staffNotes,
      queueStatus,
      checklist,
      assignedStaffId,
      dismissReason,
      archiveReason,
      activityEntry,
    } = body;

    const itemRef = adminDb.collection('staffQueue').doc(itemId);
    const itemDoc = await itemRef.get();
    if (!itemDoc.exists) return jsonError(404, 'Staff queue item not found');

    const item = itemDoc.data() as any;
    const now = new Date().toISOString();

    // Get reviewer display name
    const userRecord = await adminAuth.getUser(decoded.uid).catch(() => null);
    const reviewerName = userRecord?.displayName || userRecord?.email || decoded.uid;
    const reviewerEmail = userRecord?.email || decoded.uid;

    // ── Apply transaction field updates ─────────────────────────────────────
    if (txUpdates && item.transactionId) {
      const txRef = adminDb.collection('transactions').doc(item.transactionId);

      // Fetch current transaction state for merging
      const currentTxDoc = await txRef.get();
      const currentTx = currentTxDoc.exists ? (currentTxDoc.data() as any) : {};

      const allowed: Record<string, any> = {};
      for (const [k, v] of Object.entries(txUpdates)) {
        if (EDITABLE_TX_FIELDS.has(k)) allowed[k] = v;
      }

      if (Object.keys(allowed).length > 0) {
        allowed.updatedAt = now;

        // ── Auto-recalculate commission when financial fields change ──────────
        // If any commission-triggering field changed, recompute the splitSnapshot
        // so agent net, company dollar, and tier are always up to date.
        const hasCommissionChange = Object.keys(txUpdates).some(k => COMMISSION_TRIGGER_FIELDS.has(k));
        if (hasCommissionChange) {
          try {
            // Merge new values over current transaction to get the effective GCI
            const merged = { ...currentTx, ...allowed };
            const newGCI = resolveGCI({
              gci: merged.gci,
              salePrice: merged.salePrice,
              commissionPercent: merged.commissionPercent,
              commissionBasePrice: merged.commissionBasePrice,
            });

            if (newGCI > 0) {
              const agentId = String(currentTx.agentId || item.agentId || '').trim();
              const agentDisplayName = String(currentTx.agentDisplayName || item.agentDisplayName || '').trim();

              if (agentId) {
                const txDate = allowed.closedDate || allowed.contractDate ||
                  currentTx.closedDate || currentTx.contractDate || null;
                const calculation = await resolveTransactionCalculation({
                  agentId,
                  agentDisplayName,
                  commission: newGCI,
                  transactionDate: txDate,
                });
                allowed.commission = newGCI;
                allowed.splitSnapshot = calculation.splitSnapshot;
                allowed.creditSnapshot = calculation.creditSnapshot;
                allowed.agentType = calculation.agentType;
                allowed.calculationModel = calculation.calculationModel;
              }
            }
          } catch (calcErr: any) {
            // Non-fatal: log but don't block the save
            console.warn('[staff-queue PATCH] Commission recalculation failed (non-fatal):', calcErr?.message);
          }
        }

        await txRef.update(allowed);

        // Rebuild agent rollup so leaderboard and tier progression stay in sync
        try {
          const agentId = String(currentTx.agentId || item.agentId || '').trim();
          const txYear = Number(
            allowed.year ||
            (allowed.closedDate ? new Date(allowed.closedDate).getFullYear() : null) ||
            currentTx.year ||
            new Date().getFullYear()
          );
          if (agentId && txYear) {
            await rebuildAgentRollup(adminDb, agentId, txYear);
          }
        } catch (rollupErr: any) {
          console.warn('[staff-queue PATCH] Rollup rebuild failed (non-fatal):', rollupErr?.message);
        }
      }
    }

    // ── Update checklist items ───────────────────────────────────────────────
    if (checklist && Array.isArray(checklist)) {
      const batch = adminDb.batch();
      for (const ci of checklist) {
        if (!ci.itemId) continue;
        const ref = itemRef.collection('checklist').doc(ci.itemId);
        batch.update(ref, {
          completed: ci.completed,
          completedBy: ci.completedBy ?? null,
          completedAt: ci.completedAt ?? null,
        });
      }
      await batch.commit();
    }

    // ── Build queue item updates ─────────────────────────────────────────────
    const itemUpdates: Record<string, any> = { updatedAt: now };

    if (staffNotes !== undefined) itemUpdates.staffNotes = staffNotes;
    if (assignedStaffId !== undefined) itemUpdates.assignedStaffId = assignedStaffId;

    let logAction: string | null = null;
    let logDetail: string | null = null;

    if (action === 'start_review') {
      itemUpdates.status = 'in_progress';
      itemUpdates.reviewedBy = decoded.uid;
      itemUpdates.reviewedByName = reviewerName;
      logAction = 'In Progress';
      logDetail = `Marked in progress by ${reviewerEmail}`;
    } else if (action === 'complete') {
      itemUpdates.status = 'completed';
      itemUpdates.reviewedBy = decoded.uid;
      itemUpdates.reviewedByName = reviewerName;
      itemUpdates.reviewedAt = now;
      logAction = 'Completed';
      logDetail = `Completed by ${reviewerEmail}`;
    } else if (action === 'dismiss') {
      itemUpdates.status = 'dismissed';
      itemUpdates.reviewedBy = decoded.uid;
      itemUpdates.reviewedByName = reviewerName;
      itemUpdates.reviewedAt = now;
      if (dismissReason) itemUpdates.dismissReason = dismissReason;
      logAction = 'Dismissed';
      logDetail = dismissReason ? `Dismissed by ${reviewerEmail}: ${dismissReason}` : `Dismissed by ${reviewerEmail}`;
    } else if (action === 'archive') {
      itemUpdates.status = 'archived';
      itemUpdates.archivedBy = reviewerEmail;
      itemUpdates.archivedAt = now;
      if (archiveReason) itemUpdates.archiveReason = archiveReason;
      logAction = 'Archived';
      logDetail = archiveReason ? `Archived by ${reviewerEmail}: ${archiveReason}` : `Archived by ${reviewerEmail}`;
    } else if (action === 'reopen' || action === 'in_progress') {
      itemUpdates.status = 'in_progress';
      logAction = 'Re-opened';
      logDetail = `Re-opened by ${reviewerEmail}`;
    } else if (action === 'remove') {
      // Hard delete
      await itemRef.delete();
      return NextResponse.json({ ok: true, removed: true });
    } else if (action === 'save') {
      // Just save fields — no status change
      logAction = 'Updated';
      logDetail = `Updated by ${reviewerEmail}`;
    } else if (queueStatus) {
      itemUpdates.status = queueStatus;
    }

    await itemRef.update(itemUpdates);

    // ── Write activity log entry ─────────────────────────────────────────────
    const entryToLog = activityEntry || (logAction ? { action: logAction, detail: logDetail } : null);
    if (entryToLog) {
      await itemRef.collection('activityLog').add({
        action: entryToLog.action,
        detail: entryToLog.detail || '',
        timestamp: now,
        by: reviewerEmail,
      });
    }

    // ── Notify agent of staff actions ───────────────────────────────────────
    const agentIdSlug = String(item.agentId || '').trim();
    const agentUid = agentIdSlug ? await getAgentUid(adminDb, agentIdSlug) : null;
    if (agentUid) {
      const txAddress = String(item.address || item.transactionAddress || 'your transaction');
      let notifTitle: string | null = null;
      let notifBody: string | null = null;

      if (action === 'complete') {
        notifTitle = 'Staff Review Complete ✅';
        notifBody = `Staff has completed the review for ${txAddress}. Check your transaction for any updates.`;
      } else if (action === 'dismiss') {
        notifTitle = 'Staff Queue Item Dismissed';
        notifBody = `The staff queue item for ${txAddress} was dismissed by ${reviewerName}.`;
      } else if (action === 'start_review') {
        notifTitle = 'Staff Started Reviewing Your Listing';
        notifBody = `${reviewerName} has started reviewing ${txAddress}.`;
      } else if (action === 'save' || txUpdates) {
        notifTitle = 'Staff Updated Your Transaction';
        notifBody = `${reviewerName} made updates to ${txAddress}.`;
      } else if (checklist && Array.isArray(checklist) && checklist.some((c: any) => c.completed)) {
        notifTitle = 'Staff Checklist Updated';
        notifBody = `${reviewerName} completed a checklist task for ${txAddress}.`;
      } else if (activityEntry) {
        notifTitle = 'Staff Activity Updated';
        notifBody = `${reviewerName} logged an activity update for ${txAddress}.`;
      }

      if (notifTitle && notifBody) {
        void sendNotification(adminDb, {
          type: 'staff_queue_resolved',
          recipientUids: [agentUid],
          title: notifTitle,
          body: notifBody,
          url: '/dashboard/transactions',
        }).catch(e => console.error('[staff-queue PATCH] notification error:', e));
      }
    }

    return NextResponse.json({ ok: true, updated: { id: itemId, ...itemUpdates } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
