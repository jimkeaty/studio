/**
 * PATCH /api/admin/transaction-checklist/[checklistId]
 *   Update a checklist: check off item, add note, mark complete, clear banner
 *   Body: {
 *     action: 'complete_item' | 'add_note' | 'mark_complete' | 'clear_banner',
 *     itemId?: string,
 *     note?: string,
 *     staffName?: string,
 *   }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

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

async function isStaffOrAdmin(uid: string): Promise<{ allowed: boolean; name: string; role: string }> {
  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) return { allowed: false, name: '', role: '' };
  const data = userDoc.data()!;
  const role = data.role || '';
  return {
    allowed: ['admin', 'staff', 'tc'].includes(role),
    name: data.displayName || data.name || 'Staff',
    role,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { checklistId: string } }
) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');

  const { allowed, name: staffName } = await isStaffOrAdmin(uid);
  if (!allowed) return jsonError(403, 'Forbidden');

  const { checklistId } = params;
  const body = await req.json();
  const { action, itemId, note } = body;

  const docRef = adminDb.collection('transactionChecklists').doc(checklistId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return jsonError(404, 'Checklist not found');

  const data = docSnap.data()!;
  const now = new Date().toISOString();

  if (action === 'complete_item') {
    if (!itemId) return jsonError(400, 'itemId is required');
    const items = (data.items || []).map((item: any) => {
      if (item.id === itemId) {
        return {
          ...item,
          completed: true,
          completedBy: uid,
          completedByName: staffName,
          completedAt: now,
        };
      }
      return item;
    });

    await docRef.update({ items, updatedAt: now });

    // Notify agent that a checklist item was completed
    if (data.agentId) {
      const completedItem = items.find((i: any) => i.id === itemId);
      await sendNotification(adminDb, {
        type: 'checklist_item_completed',
        recipientUids: [data.agentId],
        title: 'Checklist Item Completed',
        body: `${staffName} completed: "${completedItem?.label || itemId}"`,
        url: `/dashboard/transactions/${data.transactionId}`,
        data: { transactionId: data.transactionId, checklistId, itemId },
        senderName: staffName,
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === 'add_note') {
    if (!itemId) return jsonError(400, 'itemId is required');
    const items = (data.items || []).map((item: any) => {
      if (item.id === itemId) {
        return { ...item, note: note || null };
      }
      return item;
    });

    await docRef.update({ items, updatedAt: now });

    // Notify agent that a note was added
    if (data.agentId && note) {
      const noteItem = items.find((i: any) => i.id === itemId);
      await sendNotification(adminDb, {
        type: 'checklist_note_added',
        recipientUids: [data.agentId],
        title: 'Staff Note Added',
        body: `${staffName} added a note on "${noteItem?.label || itemId}": ${note}`,
        url: `/dashboard/transactions/${data.transactionId}`,
        data: { transactionId: data.transactionId, checklistId, itemId },
        senderName: staffName,
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === 'mark_complete') {
    await docRef.update({
      status: 'complete',
      completedBy: uid,
      completedByName: staffName,
      completedAt: now,
      agentUpdateBanner: false,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === 'clear_banner') {
    await docRef.update({
      agentUpdateBanner: false,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true });
  }

  return jsonError(400, `Unknown action: ${action}`);
}
