import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { caller } from '@/lib/socialMedia/queue';
export async function POST(req: NextRequest) { try { const user = await caller(req); if (!user.isStaff) return NextResponse.json({ ok: false, error: 'Marketing or Admin access is required.' }, { status: 403 }); await adminDb.collection('facebookPageConnections').doc('default').set({ status: 'disconnected', pageTokenEncrypted: null, disconnectedAt: new Date(), disconnectedBy: user.uid, lastError: null }, { merge: true }); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ ok: false, error: 'Unable to disconnect Facebook Page.' }, { status: 500 }); } }
