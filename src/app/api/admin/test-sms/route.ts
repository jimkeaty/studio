// POST /api/admin/test-sms — send a test SMS via Twilio to verify A2P setup
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const isAdmin = await isAdminLike(adminDb, uid);
  if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { toNumber } = await req.json();
  if (!toNumber) return NextResponse.json({ error: 'toNumber is required' }, { status: 400 });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({
      error: 'Twilio env vars not configured',
      missing: {
        TWILIO_ACCOUNT_SID: !accountSid,
        TWILIO_AUTH_TOKEN: !authToken,
        TWILIO_FROM_NUMBER: !fromNumber,
      }
    }, { status: 500 });
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);

    const message = await client.messages.create({
      body: `✅ Smart Broker USA — SMS test successful! Your A2P certified number (${fromNumber}) is working correctly. Notifications will now be delivered via SMS.`,
      from: fromNumber,
      to: toNumber,
    });

    return NextResponse.json({
      ok: true,
      messageSid: message.sid,
      status: message.status,
      from: fromNumber,
      to: toNumber,
    });
  } catch (e: any) {
    return NextResponse.json({
      error: e.message,
      code: e.code,
      moreInfo: e.moreInfo,
    }, { status: 500 });
  }
}
