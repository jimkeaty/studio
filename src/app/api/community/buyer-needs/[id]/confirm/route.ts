import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

const COL = 'buyerNeeds';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    await ref.update({ lastConfirmedAt: new Date().toISOString(), status: 'active' });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) {
      return new Response('<html><body><h2>Not found.</h2></body></html>', { headers: { 'Content-Type': 'text/html' }, status: 404 });
    }
    await ref.update({ lastConfirmedAt: new Date().toISOString(), status: 'active' });
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#16a34a">✅ Confirmed!</h2>
        <p>Your buyer need has been confirmed as still active.</p>
        <p style="color:#888">It will remain on the board for another week.</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
