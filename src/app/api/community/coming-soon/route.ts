import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

const COL = 'comingSoonListings';

export async function GET(req: NextRequest) {
  try {
    const snap = await adminDb.collection(COL).where('status', '==', 'active').get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      area,
      address,
      price,
      beds,
      baths,
      sqft,
      acreage,
      pool,
      generator,
      stories,
      otherAmenities,
      notes,
      expectedDate,
      agentName,
      agentPhone,
      agentEmail,
      agentProfileId,
    } = body;

    if (!area || !agentName || !agentPhone) {
      return NextResponse.json({ ok: false, error: 'area, agentName, and agentPhone are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const doc = {
      area: area.trim(),
      address: address?.trim() || '',
      price: price ? Number(price) : null,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      sqft: sqft ? Number(sqft) : null,
      acreage: acreage ? Number(acreage) : null,
      pool: pool === true || pool === 'true',
      generator: generator === true || generator === 'true',
      stories: stories || null,
      otherAmenities: otherAmenities?.trim() || '',
      notes: notes?.trim() || '',
      expectedDate: expectedDate || null,
      agentName: agentName.trim(),
      agentPhone: agentPhone.trim(),
      agentEmail: agentEmail?.trim() || '',
      agentProfileId: agentProfileId || auth.uid,
      status: 'active',
      createdAt: now,
      lastConfirmedAt: now,
      createdByUid: auth.uid,
    };

    const ref = await adminDb.collection(COL).add(doc);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
