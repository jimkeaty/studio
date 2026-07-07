// src/app/api/admin/twilio-settings/route.ts
// GET  /api/admin/twilio-settings — fetch current Twilio settings from Firestore
// POST /api/admin/twilio-settings — save Twilio settings to Firestore
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function verifyAdmin(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  const token = h.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch {
    return null;
  }
}

// --------------- GET ---------------
export async function GET(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const doc = await adminDb.collection('settings').doc('twilio').get();
    const envFromNumber = process.env.TWILIO_FROM_NUMBER || '';
    const envAccountSid = process.env.TWILIO_ACCOUNT_SID || '';

    if (!doc.exists) {
      return NextResponse.json({
        ok: true,
        settings: {
          fromNumber: envFromNumber,
          accountSidMasked: envAccountSid ? `${envAccountSid.slice(0, 6)}...${envAccountSid.slice(-4)}` : '',
          source: 'env',
          updatedAt: null,
        },
      });
    }

    const data = doc.data()!;
    const firestoreFromNumber = data.fromNumber || envFromNumber;
    return NextResponse.json({
      ok: true,
      settings: {
        fromNumber: firestoreFromNumber,
        accountSidMasked: envAccountSid ? `${envAccountSid.slice(0, 6)}...${envAccountSid.slice(-4)}` : '',
        source: data.fromNumber ? 'firestore' : 'env',
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/admin/twilio-settings]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// --------------- POST ---------------
export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const body = await req.json();
    const { fromNumber } = body;

    if (!fromNumber || typeof fromNumber !== 'string' || !fromNumber.trim()) {
      return jsonError(400, 'fromNumber is required');
    }

    // Basic E.164 validation
    const cleaned = fromNumber.trim();
    if (!/^\+1[2-9]\d{9}$/.test(cleaned)) {
      return jsonError(400, 'fromNumber must be a valid US phone number in E.164 format (e.g. +13372703108)');
    }

    await adminDb.collection('settings').doc('twilio').set(
      {
        fromNumber: cleaned,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: decoded.uid,
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      settings: {
        fromNumber: cleaned,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[POST /api/admin/twilio-settings]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
