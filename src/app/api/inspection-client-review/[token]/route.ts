import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

const CHOICES = ['concern', 'request_repair', 'request_credit_allowance', 'accept_as_is', 'needs_discussion', 'not_concerned'];
const LABELS: Record<string, string> = { concern: 'Concern', request_repair: 'Request Repair', request_credit_allowance: 'Request Credit / Allowance', accept_as_is: 'Accept As-Is', needs_discussion: 'Needs Discussion', not_concerned: 'Not Concerned' };
const serialize = (value: any): any => value && typeof value?.toDate === 'function' ? value.toDate().toISOString() : Array.isArray(value) ? value.map(serialize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)])) : value;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await adminDb.collection('inspectionClientReviews').doc(token).get();
  if (!share.exists || share.data()?.active !== true) return NextResponse.json({ ok: false, error: 'This inspection review link is unavailable.' }, { status: 404 });
  const txDoc = await adminDb.collection('transactions').doc(String(share.data()?.transactionId || '')).get();
  if (!txDoc.exists) return NextResponse.json({ ok: false, error: 'Transaction not found.' }, { status: 404 });
  const tx = txDoc.data() as Record<string, any>; const review = tx.inspectionReview || {};
  return NextResponse.json({ ok: true, propertyAddress: tx.propertyAddress || tx.address || 'Property', disclaimer: 'This summary reflects documented inspector findings reviewed by your agent. It does not replace the original inspection report, the inspector’s professional judgment, legal advice, or contractor evaluation.', findings: serialize((review.findings || []).filter((finding: any) => !finding.removed).map((finding: any) => ({ id: finding.id, category: finding.category, title: finding.title, description: finding.description, selection: finding.clientSelection || null }))), choices: CHOICES.map((value) => ({ value, label: LABELS[value] })) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const shareRef = adminDb.collection('inspectionClientReviews').doc(token); const share = await shareRef.get();
  if (!share.exists || share.data()?.active !== true) return NextResponse.json({ ok: false, error: 'This inspection review link is unavailable.' }, { status: 404 });
  const body = await req.json(); const selections = Array.isArray(body.selections) ? body.selections : [];
  if (selections.some((entry: any) => !CHOICES.includes(String(entry.choice || '')))) return NextResponse.json({ ok: false, error: 'Invalid client selection.' }, { status: 400 });
  const txRef = adminDb.collection('transactions').doc(String(share.data()?.transactionId || '')); const txDoc = await txRef.get();
  if (!txDoc.exists) return NextResponse.json({ ok: false, error: 'Transaction not found.' }, { status: 404 });
  const tx = txDoc.data() as Record<string, any>; const review = tx.inspectionReview || {}; const now = new Date().toISOString(); const byId = new Map(selections.map((entry: any) => [String(entry.findingId), { choice: String(entry.choice), comment: String(entry.comment || '').trim().slice(0, 2000), selectedAt: now }]));
  const findings = (review.findings || []).map((finding: any) => byId.has(finding.id) ? { ...finding, clientSelection: byId.get(finding.id) } : finding);
  const next = { ...review, findings, clientSelectionsReceivedAt: now, history: [...(review.history || []).slice(-99), { event: 'Client selections submitted', at: now, name: 'Client review link' }] };
  await txRef.set({ inspectionReview: next, updatedAt: now }, { merge: true }); await shareRef.set({ respondedAt: now }, { merge: true }); await txRef.collection('processingHistory').add({ action: 'Inspection review: Client selections submitted', detail: 'Client selections were submitted through the secure review link.', actor: { name: 'Client review link' }, timestamp: now });
  return NextResponse.json({ ok: true });
}
