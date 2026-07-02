import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const COL = 'openHouseListings';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    await ref.update({
      lastConfirmedAt: new Date().toISOString(),
      status: 'active',
      renewalPromptSentAt: FieldValue.delete(),
    });
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
    await ref.update({
      lastConfirmedAt: new Date().toISOString(),
      status: 'active',
      renewalPromptSentAt: FieldValue.delete(),
    });
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f9fafb;">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:48px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <h2 style="color:#16a34a;margin:0 0 8px;">Confirmed!</h2>
          <p style="color:#374151;margin:0 0 8px;">Your post has been confirmed as still active.</p>
          <p style="color:#6b7280;font-size:14px;">It will remain on the office board for another 14 days.</p>
          <p style="margin-top:24px;"><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa.web.app'}/dashboard/tv-mode" style="color:#f97316;text-decoration:none;font-weight:600;">View Office Board →</a></p>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
