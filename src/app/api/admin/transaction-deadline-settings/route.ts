import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const defaults = { reminderEnabled: true, reminderHour: 8, reminderMinute: 0, criticalEscalationEnabled: false };
async function admin(req: NextRequest) { const header = req.headers.get('authorization') || ''; if (!header.startsWith('Bearer ')) return null; try { const decoded = await adminAuth.verifyIdToken(header.slice(7)); return (await isAdminLike(decoded.uid)) ? decoded : null; } catch { return null; } }
export async function GET(req: NextRequest) { if (!(await admin(req))) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }); const data = (await adminDb.collection('transactionDeadlineSettings').doc('default').get()).data() || {}; return NextResponse.json({ ok: true, settings: { ...defaults, ...data } }); }
export async function POST(req: NextRequest) { const caller = await admin(req); if (!caller) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }); const body = await req.json().catch(() => ({})); const update = { reminderEnabled: body.reminderEnabled !== false, reminderHour: Math.min(23, Math.max(0, Number(body.reminderHour ?? 8))), reminderMinute: Math.min(59, Math.max(0, Number(body.reminderMinute ?? 0))), criticalEscalationEnabled: false, updatedAt: new Date(), updatedBy: caller.uid }; await adminDb.collection('transactionDeadlineSettings').doc('default').set(update, { merge: true }); return NextResponse.json({ ok: true, settings: update }); }
