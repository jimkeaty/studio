import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

async function verifyAdmin(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try { const decoded = await adminAuth.verifyIdToken(header.slice(7)); return (await isAdminLike(decoded.uid)) ? decoded : null; } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
  const snapshot = await adminDb.collection('brokerKnowledge').orderBy('updatedAt', 'desc').limit(200).get();
  return NextResponse.json({ ok: true, entries: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
}

export async function POST(req: NextRequest) {
  const decoded = await verifyAdmin(req);
  if (!decoded) return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!title || !content) return NextResponse.json({ ok: false, error: 'Title and approved source content are required.' }, { status: 400 });
  const now = new Date();
  const ref = adminDb.collection('brokerKnowledge').doc();
  await ref.set({ status: 'approved', title: title.slice(0, 240), content: content.slice(0, 50000), summary: String(body.summary || '').trim() || null, tags: Array.isArray(body.tags) ? body.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, 25) : [], jurisdiction: String(body.jurisdiction || '').trim() || null, formVersion: String(body.formVersion || '').trim() || null, documentUrl: String(body.documentUrl || '').trim() || null, sourceUpdatedAt: String(body.sourceUpdatedAt || '').trim() || null, sourceType: String(body.sourceType || 'policy').trim(), createdAt: now, updatedAt: now, approvedBy: decoded.uid });
  return NextResponse.json({ ok: true, id: ref.id });
}
