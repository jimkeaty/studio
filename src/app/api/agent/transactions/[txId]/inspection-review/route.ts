import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getStaffRole, isAdminLike } from '@/lib/auth/staffAccess';

const CATEGORIES = ['major_concerns', 'safety', 'structural', 'roof', 'hvac', 'plumbing', 'electrical', 'cosmetic_minor', 'maintenance', 'further_evaluation'] as const;
const CLIENT_CHOICES = ['concern', 'request_repair', 'request_credit_allowance', 'accept_as_is', 'needs_discussion', 'not_concerned'] as const;
const NEGOTIATION_STATES = ['draft', 'ready_for_negotiation', 'sent_to_other_side', 'agreed', 'declined', 'resolved_as_is'] as const;

function bearer(req: NextRequest) {
  const value = req.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}
function fail(status: number, error: string) { return NextResponse.json({ ok: false, error }, { status }); }
function serialize(value: any): any {
  if (value == null) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

async function authorize(req: NextRequest, transaction: Record<string, any>) {
  const token = bearer(req);
  if (!token) throw new Error('UNAUTHORIZED');
  const decoded = await adminAuth.verifyIdToken(token);
  if (await isAdminLike(decoded.uid)) return decoded;
  const staffRole = await getStaffRole(decoded.uid);
  if (staffRole && ['tc', 'tc_admin', 'office_admin'].includes(staffRole)) return decoded;
  const agentProfile = await adminDb.collection('agentProfiles').where('firebaseUid', '==', decoded.uid).limit(1).get();
  const ids = new Set([decoded.uid, ...agentProfile.docs.map((doc) => doc.id)]);
  if (ids.has(String(transaction.agentId || '')) || ids.has(String(transaction.coAgentId || ''))) return decoded;
  throw new Error('FORBIDDEN');
}

function sanitizeFinding(input: any, prior?: any) {
  const category = CATEGORIES.includes(input.category) ? input.category : 'further_evaluation';
  return {
    id: String(prior?.id || input.id || randomUUID()),
    category,
    title: String(input.title || '').trim().slice(0, 160),
    description: String(input.description || '').trim().slice(0, 4000),
    originalText: String(input.originalText || prior?.originalText || '').trim().slice(0, 4000),
    removed: Boolean(input.removed),
    agentEdited: true,
    negotiationStatus: NEGOTIATION_STATES.includes(input.negotiationStatus) ? input.negotiationStatus : (prior?.negotiationStatus || 'draft'),
    clientSelection: prior?.clientSelection || null,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ txId: string }> }) {
  try {
    const { txId } = await params;
    const txDoc = await adminDb.collection('transactions').doc(txId).get();
    if (!txDoc.exists) return fail(404, 'Transaction not found');
    const transaction = txDoc.data() as Record<string, any>;
    await authorize(req, transaction);
    const review = transaction.inspectionReview || {};
    return NextResponse.json({ ok: true, transaction: { id: txId, propertyAddress: transaction.propertyAddress || transaction.address || '', buyerName: transaction.buyerName || transaction.clientName || '', inspectionDeadline: transaction.inspectionDeadline || '', documents: transaction.documents || [] }, review: serialize(review), categories: CATEGORIES, clientChoices: CLIENT_CHOICES, negotiationStates: NEGOTIATION_STATES });
  } catch (cause: any) {
    if (cause?.message === 'UNAUTHORIZED') return fail(401, 'Unauthorized');
    if (cause?.message === 'FORBIDDEN') return fail(403, 'You do not have access to this inspection review');
    return fail(500, cause?.message || 'Unable to load inspection review');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ txId: string }> }) {
  try {
    const { txId } = await params;
    const txRef = adminDb.collection('transactions').doc(txId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) return fail(404, 'Transaction not found');
    const transaction = txDoc.data() as Record<string, any>;
    const decoded = await authorize(req, transaction);
    const actor = await adminAuth.getUser(decoded.uid).catch(() => null);
    const body = await req.json();
    const now = new Date().toISOString();
    const existing = (transaction.inspectionReview || {}) as Record<string, any>;
    const history = Array.isArray(existing.history) ? existing.history : [];
    const actorEntry = { uid: decoded.uid, name: actor?.displayName || actor?.email || decoded.email || decoded.uid, at: now };
    let next: Record<string, any> = { ...existing, updatedAt: now };
    let event = '';

    if (body.action === 'save_review') {
      const priorById = new Map((existing.findings || []).map((finding: any) => [finding.id, finding]));
      const findings = Array.isArray(body.findings) ? body.findings.map((finding: any) => sanitizeFinding(finding, priorById.get(finding.id))).filter((finding: any) => finding.title || finding.description) : [];
      next = { ...next, source: 'smart_inspector_manual_import', originalReportName: String(body.originalReportName || '').trim().slice(0, 240), originalReportUrl: String(body.originalReportUrl || '').trim().slice(0, 2000), analysisSummary: String(body.analysisSummary || '').trim().slice(0, 5000), findings, agentReviewedAt: now, agentReviewedBy: actorEntry };
      event = 'Agent review saved';
    } else if (body.action === 'create_client_link') {
      const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
      await adminDb.collection('inspectionClientReviews').doc(token).set({ transactionId: txId, createdAt: now, createdBy: actorEntry, active: true });
      next.clientDelivery = { ...next.clientDelivery, token, createdAt: now, createdBy: actorEntry, deliveredAt: null, deliveredBy: null };
      event = 'Client review link created';
    } else if (body.action === 'mark_client_delivered') {
      if (!existing.clientDelivery?.token) return fail(400, 'Create the client review link before marking it delivered');
      next.clientDelivery = { ...existing.clientDelivery, deliveredAt: now, deliveredBy: actorEntry };
      event = 'Client review link marked delivered';
    } else if (body.action === 'update_negotiation') {
      const findingId = String(body.findingId || '');
      const status = String(body.negotiationStatus || '');
      if (!NEGOTIATION_STATES.includes(status as any)) return fail(400, 'Invalid negotiation status');
      next.findings = (existing.findings || []).map((finding: any) => finding.id === findingId ? { ...finding, negotiationStatus: status, negotiationUpdatedAt: now, negotiationUpdatedBy: actorEntry } : finding);
      event = `Negotiation status updated to ${status}`;
    } else {
      return fail(400, 'Unsupported inspection review action');
    }

    next.history = [...history.slice(-99), { event, ...actorEntry }];
    await txRef.set({ inspectionReview: next, updatedAt: now }, { merge: true });
    await txRef.collection('processingHistory').add({ action: `Inspection review: ${event}`, detail: event, actor: actorEntry, timestamp: now });
    const origin = new URL(req.url).origin;
    return NextResponse.json({ ok: true, review: serialize(next), clientReviewUrl: next.clientDelivery?.token ? `${origin}/inspection-review/${next.clientDelivery.token}` : null });
  } catch (cause: any) {
    if (cause?.message === 'UNAUTHORIZED') return fail(401, 'Unauthorized');
    if (cause?.message === 'FORBIDDEN') return fail(403, 'You do not have access to this inspection review');
    return fail(500, cause?.message || 'Unable to save inspection review');
  }
}
