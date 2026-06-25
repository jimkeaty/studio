import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

/** Get Firebase UIDs of all active agents from agentProfiles */
async function getAllActiveAgentUids(): Promise<string[]> {
  try {
    const snap = await adminDb.collection('agentProfiles').where('status', '==', 'active').get();
    const uids: string[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const uid = data.firebaseUid || data.uid;
      if (uid) uids.push(uid as string);
    });
    return uids;
  } catch {
    return [];
  }
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

    // ── Broadcast notification to all active agents ──────────────────────────
    try {
      const recipientUids = await getAllActiveAgentUids();
      const dateStr = openHouseDate
        ? new Date(openHouseDate + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : '';
      const compStr = compensation ? `💵 $${Number(compensation)} offered` : '';
      const msgLines = [
        `${agentName} posted an Open House Opportunity`,
        address.trim(),
        dateStr ? `📅 ${dateStr}${openHouseTime ? ` at ${openHouseTime}` : ''}` : '',
        compStr,
        `📞 ${agentPhone.trim()}`,
      ].filter(Boolean).join('\n');

      await Promise.allSettled(
        recipientUids
          .filter((uid) => uid !== auth.uid)
          .map((uid) =>
            sendNotification(adminDb, {
              type: 'open_house_opportunity',
              recipientUids: [uid],
              title: '🏠 New Open House Opportunity',
              body: msgLines,
              data: { openHouseId: ref.id, agentName, address },
            })
          )
      );
    } catch (notifyErr) {
      console.error('open-house-opportunity notify error:', notifyErr);
    }

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
