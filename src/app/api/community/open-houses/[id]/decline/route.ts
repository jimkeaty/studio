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
      status: 'archived',
      archivedAt: FieldValue.serverTimestamp(),
      archivedReason: 'agent_declined',
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
      status: 'archived',
      archivedAt: FieldValue.serverTimestamp(),
      archivedReason: 'agent_declined',
      renewalPromptSentAt: FieldValue.delete(),
    });
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f9fafb;">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:48px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
          <div style="font-size:48px;margin-bottom:16px;">📦</div>
          <h2 style="color:#6b7280;margin:0 0 8px;">Post Archived</h2>
          <p style="color:#374151;margin:0 0 8px;">Your post has been removed from the office board.</p>
          <p style="color:#6b7280;font-size:14px;">It has been saved to your Archived Posts in case you want to re-add it later.</p>
          <p style="margin-top:24px;"><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa.web.app'}/dashboard/tv-mode?tab=archived" style="color:#f97316;text-decoration:none;font-weight:600;">View Archived Posts →</a></p>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
