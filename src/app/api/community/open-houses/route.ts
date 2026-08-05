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

const COL = 'openHouseListings';

export async function GET(req: NextRequest) {
  try {
    const snap = await adminDb
      .collection(COL)
      .where('status', '==', 'active')
      .get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort by openHouseDate ascending (nearest first)
    items.sort((a: any, b: any) => {
      const da = a.openHouseDate || '';
      const db2 = b.openHouseDate || '';
      return da < db2 ? -1 : da > db2 ? 1 : 0;
    });
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
      address,
      price,
      beds,
      baths,
      sqft,
      notes,
      agentName,
      agentPhone,
      agentEmail,
      agentProfileId,
      openHouseDate,
      openHouseTime,
      openHouseEndTime,
      // Compensation fields
      compensation,
      compensationNote,
    } = body;

    if (!address || !agentName || !agentPhone) {
      return NextResponse.json(
        { ok: false, error: 'address, agentName, and agentPhone are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const doc: Record<string, any> = {
      address: address.trim(),
      price: price ? Number(price) : null,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      sqft: sqft ? Number(sqft) : null,
      notes: notes?.trim() || '',
      agentName: agentName.trim(),
      agentPhone: agentPhone.trim(),
      agentEmail: agentEmail?.trim() || '',
      agentProfileId: agentProfileId || auth.uid,
      openHouseDate: openHouseDate || null,
      openHouseTime: openHouseTime?.trim() || '',
      openHouseEndTime: openHouseEndTime?.trim() || '',
      // Compensation
      compensation: compensation ? Number(compensation) : null,
      compensationNote: compensationNote?.trim() || '',
      // Claim fields — initially empty
      claimedByUid: null,
      claimedByName: null,
      claimedByPhone: null,
      claimedByEmail: null,
      claimedDate: null,
      claimedTime: null,
      claimedEndTime: null,
      claimedAt: null,
      status: 'active',
      createdAt: now,
      lastConfirmedAt: now,
      createdByUid: auth.uid,
    };

    const ref = await adminDb.collection(COL).add(doc);

    // ── Broadcast to agents who opted in to Open House notifications (fire-and-forget)
    void broadcastTvPost(adminDb, {
      postType: 'openHouseOpps',
      postId: ref.id,
      agentName: agentName.trim(),
      excludeUid: auth.uid,
      description: [
        address.trim(),
        openHouseDate
          ? `📅 ${new Date(openHouseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${openHouseTime ? ` at ${openHouseTime}` : ''}`
          : '',
        compensation ? `💵 $${Number(compensation)} offered` : '',
        `📞 ${agentPhone.trim()}`,
      ].filter(Boolean).join(' · '),
    }).catch((e) => console.error('[open-houses] broadcastTvPost error:', e));

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
