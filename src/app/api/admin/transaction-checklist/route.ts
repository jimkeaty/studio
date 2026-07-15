/**
 * GET  /api/admin/transaction-checklist?transactionId=xxx
 *   Returns all checklist layers for a transaction (newest first)
 *
 * POST /api/admin/transaction-checklist
 *   Creates a new checklist layer for a transaction
 *   Body: { transactionId, checklistType, agentId }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getChecklistDef, ChecklistType } from '@/lib/checklists/definitions';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function getUid(req: NextRequest): Promise<string | null> {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch { return null; }
}

async function isStaffOrAdmin(uid: string): Promise<boolean> {
  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) return false;
  const role = userDoc.data()?.role;
  return ['admin', 'staff', 'tc'].includes(role);
}

export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');
  if (!(await isStaffOrAdmin(uid))) return jsonError(403, 'Forbidden');

  const { searchParams } = new URL(req.url);
  const transactionId = searchParams.get('transactionId');
  if (!transactionId) return jsonError(400, 'transactionId is required');

  const snap = await adminDb.collection('transactionChecklists')
    .where('transactionId', '==', transactionId)
    .get();

  const checklists = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ ok: true, checklists });
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');
  if (!(await isStaffOrAdmin(uid))) return jsonError(403, 'Forbidden');

  const { transactionId, checklistType, agentId } = await req.json();
  if (!transactionId) return jsonError(400, 'transactionId is required');
  if (!checklistType) return jsonError(400, 'checklistType is required');

  const def = getChecklistDef(checklistType as ChecklistType);
  if (!def) return jsonError(400, 'Invalid checklistType');

  // Prevent duplicate active checklists of the same type for the same transaction
  const existing = await adminDb.collection('transactionChecklists')
    .where('transactionId', '==', transactionId)
    .where('checklistType', '==', checklistType)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (!existing.empty) {
    return NextResponse.json({ ok: true, id: existing.docs[0].id, alreadyExists: true });
  }

  const items = def.map(item => ({
    ...item,
    completed: false,
    completedBy: null,
    completedByName: null,
    completedAt: null,
    note: null,
  }));

  const now = new Date().toISOString();
  const docRef = await adminDb.collection('transactionChecklists').add({
    transactionId,
    checklistType,
    agentId: agentId || null,
    items,
    agentUpdateBanner: false,
    agentUpdateAt: null,
    agentUpdateDescription: null,
    status: 'active',
    completedBy: null,
    completedByName: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, id: docRef.id });
}
