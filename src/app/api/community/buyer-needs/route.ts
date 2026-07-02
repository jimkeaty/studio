import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { broadcastTvPost } from '@/lib/notifications/broadcastTvPost';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

const COL = 'buyerNeeds';

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
      minPrice,
      maxPrice,
      beds,
      baths,
      minAcreage,
      maxAcreage,
      pool,
      generator,
      stories,
      otherAmenities,
      notes,
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
      minPrice: minPrice ? Number(minPrice) : null,
      maxPrice: maxPrice ? Number(maxPrice) : null,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      minAcreage: minAcreage ? Number(minAcreage) : null,
      maxAcreage: maxAcreage ? Number(maxAcreage) : null,
      pool: pool === true || pool === 'true',
      generator: generator === true || generator === 'true',
      stories: stories || null,
      otherAmenities: otherAmenities?.trim() || '',
      notes: notes?.trim() || '',
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

    // Broadcast to agents who opted in to Buyer Need notifications (fire-and-forget)
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const pricePart = (doc.minPrice || doc.maxPrice)
      ? ` $${doc.minPrice?.toLocaleString() ?? '?'} - $${doc.maxPrice?.toLocaleString() ?? '?'}`
      : '';
    const bedBath = `${doc.beds ? doc.beds + 'bd ' : ''}${doc.baths ? doc.baths + 'ba' : ''}`.trim();
    broadcastTvPost({
      postType: 'buyerNeeds',
      postId: ref.id,
      label: 'Buyer Need',
      emoji: '\u{1F50D}',
      description: `${doc.area}${bedBath ? ' - ' + bedBath : ''}${pricePart}`,
      agentName: doc.agentName,
      dashboardUrl: `${appBaseUrl}/dashboard/tv-mode?tab=buyer-needs`,
    }).catch(e => console.error('[buyer-needs] broadcast failed:', e));

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
