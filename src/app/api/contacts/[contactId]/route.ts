// PATCH  /api/contacts/[contactId]  — update a contact
// DELETE /api/contacts/[contactId]  — delete a contact
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ contactId: string }> }
) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);

    const { contactId } = await context.params;
    const body = await req.json();

    const doc = await adminDb.collection('contacts').doc(contactId).get();
    if (!doc.exists) return jsonError(404, 'Contact not found');

    const updates: Record<string, any> = {
      ...body,
      updatedAt: new Date().toISOString(),
      updatedBy: decoded.uid,
    };
    // Prevent overwriting system fields
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;
    delete updates.usageCount;

    await adminDb.collection('contacts').doc(contactId).update(updates);
    return NextResponse.json({ ok: true, id: contactId });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ contactId: string }> }
) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    await adminAuth.verifyIdToken(token);

    const { contactId } = await context.params;
    const doc = await adminDb.collection('contacts').doc(contactId).get();
    if (!doc.exists) return jsonError(404, 'Contact not found');

    await adminDb.collection('contacts').doc(contactId).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
