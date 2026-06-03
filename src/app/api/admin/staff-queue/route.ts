// GET  /api/admin/staff-queue — fetch staff queue items
// POST /api/admin/staff-queue — create a new staff queue item (internal use)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';

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

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden: Staff only');

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status');
    const activeOnly = url.searchParams.get('active') === 'true';

    let query: FirebaseFirestore.Query = adminDb.collection('staffQueue').limit(500);

    if (activeOnly) {
      query = adminDb
        .collection('staffQueue')
        .where('status', 'in', ['pending_review', 'in_progress'])
        .limit(500);
    } else if (statusFilter && statusFilter !== 'all') {
      query = adminDb
        .collection('staffQueue')
        .where('status', '==', statusFilter)
        .limit(500);
    }

    const snap = await query.get();

    // ── Filter out demo account staff queue items ───────────────────────
    const demoSnap = await adminDb.collection('agentProfiles').where('isDemoAccount', '==', true).get();
    const demoAgentIds = new Set(demoSnap.docs.map(d => String(d.data().agentId || d.id)));

    const items = snap.docs
      .filter(d => {
        if (demoAgentIds.size === 0) return true;
        const agentId = String(d.data().agentId || '');
        return !demoAgentIds.has(agentId);
      })
      .map((d) => ({
        id: d.id,
        ...serializeFirestore(d.data()),
      }));

    // Enrich all items with ledger-style fields from linked transaction or tcIntake.
    // This covers: address (if missing), salePrice, closingType, dealType, contractDate, closedDate.
    await Promise.all(items.map(async (item: any) => {
      try {
        let resolvedAddress = (item.transactionAddress || '').trim() || (item.address || '').trim();
        let salePrice: number | null = item.salePrice ?? null;
        let closingType: string | null = item.closingType ?? null;
        let dealType: string | null = item.dealType ?? null;
        let contractDate: string | null = item.contractDate ?? null;
        let closedDate: string | null = item.closedDate ?? null;
        let gci: number | null = item.gci ?? null;

        // Try linked transaction first
        if (item.transactionId && (!resolvedAddress || salePrice == null || !closingType)) {
          const txDoc = await adminDb.collection('transactions').doc(item.transactionId).get();
          if (txDoc.exists) {
            const tx = txDoc.data()!;
            if (!resolvedAddress) resolvedAddress = (tx.propertyAddress || tx.address || '').trim();
            if (salePrice == null) salePrice = tx.salePrice ?? tx.dealValue ?? null;
            if (!closingType) closingType = tx.closingType ?? null;
            if (!dealType) dealType = tx.transactionType ?? tx.dealType ?? null;
            if (!contractDate) contractDate = tx.contractDate ?? null;
            if (!closedDate) closedDate = tx.closedDate ?? tx.closingDate ?? null;
            if (gci == null) gci = tx.splitSnapshot?.grossCommission ?? tx.commission ?? null;
          }
        }
        // Fall back to TC intake
        if (item.tcIntakeId && (!resolvedAddress || salePrice == null)) {
          const intakeDoc = await adminDb.collection('tcIntakes').doc(item.tcIntakeId).get();
          if (intakeDoc.exists) {
            const intake = intakeDoc.data()!;
            if (!resolvedAddress) resolvedAddress = (intake.address || intake.propertyAddress || '').trim();
            if (salePrice == null) salePrice = intake.salePrice ?? null;
            if (!closingType) closingType = intake.closingType ?? null;
            if (!dealType) dealType = intake.dealType ?? null;
            if (!contractDate) contractDate = intake.contractDate ?? null;
            if (!closedDate) closedDate = intake.projectedCloseDate ?? null;
            if (gci == null) gci = intake.gci ?? null;
          }
        }

        // Apply enriched fields
        if (resolvedAddress) { item.transactionAddress = resolvedAddress; item.address = resolvedAddress; }
        if (salePrice != null) item.salePrice = salePrice;
        if (closingType) item.closingType = closingType;
        if (dealType) item.dealType = dealType;
        if (contractDate) item.contractDate = contractDate;
        if (closedDate) item.closedDate = closedDate;
        if (gci != null) item.gci = gci;
      } catch {
        // Non-fatal: skip enrichment for this item
      }
    }));
    // Normalize: copy address → transactionAddress (or vice versa) so the list page always has a value
    for (const item of items as any[]) {
      if (!item.transactionAddress && item.address) item.transactionAddress = item.address;
      else if (!item.address && item.transactionAddress) item.address = item.transactionAddress;
    }

    // Sort: pending_review first, then in_progress, then completed/dismissed
    const order: Record<string, number> = { pending_review: 0, in_progress: 1, completed: 2, dismissed: 3 };
    items.sort((a: any, b: any) => {
      const ao = order[a.status] ?? 99;
      const bo = order[b.status] ?? 99;
      if (ao !== bo) return ao - bo;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    // Allow any authenticated user to create a staff queue item (agents, TC, admin)
    await adminAuth.verifyIdToken(token);

    const body = await req.json();
    const {
      transactionId,
      transactionAddress,
      agentId,
      agentName,
      actionType,       // 'new_listing' | 'status_change' | 'update'
      previousStatus,
      newStatus,
      notes,
      submittedBy,      // uid of the user who triggered this
      submittedByName,
      tcWorking,        // boolean — whether agent is working with TC
    } = body;

    if (!transactionId || !actionType) {
      return jsonError(400, 'transactionId and actionType are required');
    }

    const now = new Date().toISOString();
    const item = {
      transactionId,
      transactionAddress: transactionAddress || '',
      agentId: agentId || '',
      agentName: agentName || '',
      actionType,
      previousStatus: previousStatus || null,
      newStatus: newStatus || null,
      notes: notes || '',
      submittedBy: submittedBy || '',
      submittedByName: submittedByName || '',
      tcWorking: tcWorking ?? false,
      status: 'pending_review',   // pending_review | in_progress | completed | dismissed
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      staffNotes: '',
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('staffQueue').add(item);
    return NextResponse.json({ ok: true, id: ref.id, item: { id: ref.id, ...item } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
