import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const SETTINGS_COLLECTION = 'settings';
const SETTINGS_DOCUMENT = 'transactionFees';
const FALLBACKS = { buyerDefault: 395, listingDefault: 150 };

async function verifyBrokerAdmin(req: NextRequest) {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const decoded = await adminAuth.verifyIdToken(header.slice('Bearer '.length));
  return (await isAdminLike(decoded.uid)) ? decoded : null;
}

async function verifyAuthenticated(req: NextRequest) {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return adminAuth.verifyIdToken(header.slice('Bearer '.length));
}

function normalizeAmount(value: unknown, fallback: number) {
  if (value === '' || value === null || value === undefined) return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await verifyAuthenticated(req);
    if (!decoded) return NextResponse.json({ ok: false, error: 'Authentication is required.' }, { status: 401 });

    const snapshot = await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOCUMENT).get();
    const stored = snapshot.exists ? snapshot.data() || {} : {};
    return NextResponse.json({
      ok: true,
      settings: {
        buyerDefault: normalizeAmount(stored.buyerDefault, FALLBACKS.buyerDefault),
        listingDefault: normalizeAmount(stored.listingDefault, FALLBACKS.listingDefault),
        updatedAt: stored.updatedAt || null,
        updatedBy: stored.updatedBy || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to load transaction fee settings.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const decoded = await verifyBrokerAdmin(req);
    if (!decoded) return NextResponse.json({ ok: false, error: 'Broker administrator access is required.' }, { status: 403 });

    const body = await req.json();
    const buyerDefault = normalizeAmount(body.buyerDefault, FALLBACKS.buyerDefault);
    const listingDefault = normalizeAmount(body.listingDefault, FALLBACKS.listingDefault);

    await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOCUMENT).set({
      buyerDefault,
      listingDefault,
      updatedAt: new Date().toISOString(),
      updatedBy: decoded.uid,
    }, { merge: true });

    return NextResponse.json({ ok: true, settings: { buyerDefault, listingDefault } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to save transaction fee settings.' }, { status: 500 });
  }
}
