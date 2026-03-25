// GET /api/admin/transactions — returns all transactions for admin ledger
// PATCH /api/admin/transactions — update a single transaction by id
// DELETE /api/admin/transactions — delete a single transaction by id
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const ADMIN_EMAIL = 'jim@keatyrealestate.com';

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.email !== ADMIN_EMAIL) return null;
  return decoded;
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const snap = await adminDb
      .collection('transactions')
      .orderBy('createdAt', 'desc')
      .get();

    const transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ ok: true, transactions });
  } catch (err: any) {
    console.error('[api/admin/transactions GET]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// Allowed fields that can be updated
const UPDATABLE_FIELDS = new Set([
  'status', 'transactionType', 'closingType', 'dealType',
  'address', 'clientName', 'dealValue', 'commission',
  'commissionPercent', 'transactionFee', 'earnestMoney',
  'contractDate', 'closedDate', 'listingDate', 'projectedCloseDate',
  'optionExpiration', 'inspectionDeadline', 'surveyDeadline',
  'listPrice', 'dealSource', 'notes',
  // Client contact
  'clientEmail', 'clientPhone', 'clientNewAddress',
  'client2Name', 'client2Email', 'client2Phone',
  // Parties
  'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherBrokerage',
  'mortgageCompany', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone',
  'titleCompany', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone',
  // Financial overrides
  'splitSnapshot', 'brokerProfit',
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

    updates.updatedAt = new Date();

    await adminDb.collection('transactions').doc(id).update(updates);

    // Fetch the updated doc to return
    const updatedSnap = await adminDb.collection('transactions').doc(id).get();
    const updated = { id: updatedSnap.id, ...updatedSnap.data() };

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

    await adminDb.collection('transactions').doc(id).delete();

    return NextResponse.json({ ok: true, deleted: id });
  } catch (err: any) {
    console.error('[api/admin/transactions DELETE]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
