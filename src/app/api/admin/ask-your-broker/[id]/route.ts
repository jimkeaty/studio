import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { sendNotification } from '@/lib/notifications/sendNotification';

function jsonError(status: number, error: string) { return NextResponse.json({ ok: false, error }, { status }); }

async function verifyAdmin(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    return (await isAdminLike(decoded.uid)) ? decoded : null;
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const decoded = await verifyAdmin(req);
  if (!decoded) return jsonError(403, 'Forbidden: Admin only');
  const { id } = await params;
  const doc = await adminDb.collection('brokerEscalations').doc(id).get();
  if (!doc.exists) return jsonError(404, 'Broker review request not found');
  return NextResponse.json({ ok: true, escalation: { id: doc.id, ...doc.data() } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const decoded = await verifyAdmin(req);
  if (!decoded) return jsonError(403, 'Forbidden: Admin only');
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const answer = String(body.answer || '').trim();
  if (!answer || answer.length > 10000) return jsonError(400, 'Provide a broker response of no more than 10,000 characters.');
  const escalationRef = adminDb.collection('brokerEscalations').doc(id);
  const current = await escalationRef.get();
  if (!current.exists) return jsonError(404, 'Broker review request not found');
  const prior = current.data() as Record<string, any>;
  const now = new Date();
  const update = { status: 'answered', brokerAnswer: answer, answeredBy: decoded.uid, answeredByName: decoded.name || decoded.email || 'Broker reviewer', answeredAt: now, updatedAt: now };
  await escalationRef.update(update);

  let knowledgeId: string | null = null;
  if (body.addToKnowledgeBase === true) {
    const title = String(body.knowledgeTitle || `Broker guidance: ${prior.question || 'Untitled'}`).trim().slice(0, 240);
    const jurisdiction = String(body.jurisdiction || '').trim() || null;
    const formVersion = String(body.formVersion || '').trim() || null;
    const sourceUpdatedAt = String(body.sourceUpdatedAt || new Date().toISOString()).trim();
    const kbRef = adminDb.collection('brokerKnowledge').doc();
    await kbRef.set({
      status: 'approved', title, summary: String(body.summary || '').trim() || null,
      content: answer, tags: Array.isArray(body.tags) ? body.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, 25) : [],
      jurisdiction, formVersion, sourceUpdatedAt, sourceType: 'broker_answer',
      sourceEscalationId: id, createdAt: now, updatedAt: now, approvedBy: decoded.uid,
    });
    knowledgeId = kbRef.id;
  }
  if (prior.agentUid) await sendNotification(adminDb, { type: 'broker_question_answered', recipientUids: [String(prior.agentUid)], title: 'Broker response ready', body: `A broker response is ready${prior.transactionContext?.property ? ` for ${prior.transactionContext.property}` : ''}.`, url: `/dashboard/ask-your-broker?escalation=${id}`, data: { escalationId: id } });
  return NextResponse.json({ ok: true, escalation: { id, ...update }, knowledgeId });
}
