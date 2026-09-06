import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { PLUGIN_REGISTRY } from '@/lib/plugins/registry';

const appIds = new Set(PLUGIN_REGISTRY.map((plugin) => plugin.id));
const states = new Set(['hidden', 'coming_soon', 'active']);
const strings = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))] : [];
async function caller(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try { const decoded = await adminAuth.verifyIdToken(header.slice(7)); return (await isAdminLike(decoded.uid)) ? decoded : null; } catch { return null; }
}
export async function GET(req: NextRequest) {
  if (!(await caller(req))) return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
  const doc = await adminDb.collection('appManagement').doc('default').get();
  return NextResponse.json({ ok: true, rollouts: doc.data()?.rollouts || {}, apps: PLUGIN_REGISTRY });
}
export async function PATCH(req: NextRequest) {
  const decoded = await caller(req);
  if (!decoded) return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const appId = String(body.appId || '').trim();
  const state = String(body.state || '').trim();
  if (!appIds.has(appId) || !states.has(state)) return NextResponse.json({ ok: false, error: 'Provide a registered app and valid rollout state.' }, { status: 400 });
  const rule = { state, roles: strings(body.roles), officeIds: strings(body.officeIds), teamIds: strings(body.teamIds), userIds: strings(body.userIds), updatedAt: new Date(), updatedBy: decoded.uid };
  const ref = adminDb.collection('appManagement').doc('default');
  const prior = (await ref.get()).data()?.rollouts?.[appId] || null;
  const batch = adminDb.batch();
  batch.set(ref, { rollouts: { [appId]: rule }, updatedAt: new Date(), updatedBy: decoded.uid }, { merge: true });
  batch.create(ref.collection('auditEvents').doc(), { appId, prior, next: rule, actorUid: decoded.uid, createdAt: new Date() });
  await batch.commit();
  return NextResponse.json({ ok: true, appId, rule });
}
