import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

const COL = 'openHouseListings';

// Public confirm endpoint — linked from notification emails/SMS, no auth required
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    await ref.update({
      lastConfirmedAt: new Date().toISOString(),
      status: 'active',
    });
    return NextResponse.json({ ok: true, message: 'Listing confirmed as still active.' });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// GET version for email link clicks (redirects to a thank-you page)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) {
      return new Response('<html><body><h2>Listing not found.</h2></body></html>', {
        headers: { 'Content-Type': 'text/html' },
        status: 404,
      });
    }
    await ref.update({
      lastConfirmedAt: new Date().toISOString(),
      status: 'active',
    });
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#16a34a">✅ Confirmed!</h2>
        <p>Your open house listing has been confirmed as still active.</p>
        <p style="color:#888">It will remain on the board for another week.</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
