// GET /api/admin/transactions — returns all transactions for admin ledger
// PATCH /api/admin/transactions — update a single transaction by id
// DELETE /api/admin/transactions — delete a single transaction by id
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import { normalizeDealSource } from '@/lib/normalizeDealSource';

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
  if (!(await isAdminLike(decoded.uid))) return null;
  return decoded;
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const snap = await adminDb
      .collection('transactions')
      .get();

    const transactions = snap.docs
      .map(d => serializeFirestore({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => {
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
  'buyerClosingCostTotal', 'buyerClosingCostAgentCommission', 'buyerClosingCostTxFee', 'buyerClosingCostOther',
  // Additional info
  'warrantyAtClosing', 'warrantyPaidBy',
  'txComplianceFee', 'txComplianceFeeAmount', 'txComplianceFeePaidBy',
  'occupancyAgreement', 'occupancyDates',
  'shortageInCommission', 'shortageAmount', 'buyerBringToClosing',
  // Financial overrides
  'splitSnapshot', 'brokerProfit',
  // Split fields stored individually alongside splitSnapshot
  'agentPct', 'brokerPct', 'agentDollar', 'brokerGci',
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

    if (Object.keys(updates).length === 0) {
      return jsonError(400, 'No valid fields to update');
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

    // Recalculate year if dates changed
    if (updates.closedDate || updates.contractDate) {
      const raw = updates.closedDate || updates.contractDate;
      if (raw) {
        const d = new Date(raw);
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

    // ── Fire push notification on status changes ─────────────────────────
    try {
      const newStatus = updates.status;
      const txData = updatedSnap.data() as any;
      const agentUid = String(txData?.agentId || '').trim();
      const address = String(txData?.address || 'your transaction').trim();
      if (agentUid && newStatus && existingData?.status !== newStatus) {
        let notifPayload: { type: string; title: string; body: string; url?: string } | null = null;
        if (newStatus === 'approved') {
          notifPayload = {
            type: 'deal_approved',
            title: 'Deal Approved ✅',
            body: `${address} has been reviewed and approved.`,
            url: '/dashboard',
          };
        } else if (newStatus === 'closed') {
          notifPayload = {
            type: 'deal_approved',
            title: 'Deal Closed 🎉',
            body: `Congratulations! ${address} has been marked as closed.`,
            url: '/dashboard',
          };
        }
        if (notifPayload) {
          // Write directly to Firestore notifications collection
          // The bell icon in the header fetches from this collection
          await adminDb.collection('notifications').add({
            recipientUid: agentUid,
            type: notifPayload.type,
            title: notifPayload.title,
            body: notifPayload.body,
            url: notifPayload.url || '/dashboard',
            read: false,
            createdAt: new Date(),
          });
          // Also attempt FCM push if agent has a registered token
          const tokenSnap = await adminDb.collection('fcmTokens').doc(agentUid).get();
          const fcmToken = tokenSnap.exists ? tokenSnap.data()?.token : null;
          if (fcmToken) {
            try {
              const { getMessaging } = await import('firebase-admin/messaging');
              await getMessaging().send({
                token: fcmToken,
                notification: { title: notifPayload.title, body: notifPayload.body },
                webpush: { fcmOptions: { link: notifPayload.url || '/dashboard' } },
              });
            } catch (fcmErr: any) {
              console.warn('[FCM push] non-fatal:', fcmErr?.message);
            }
          }
        }
      }
    } catch (notifErr: any) {
      console.warn('[api/admin/transactions] Notification trigger failed (non-fatal):', notifErr?.message);
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
