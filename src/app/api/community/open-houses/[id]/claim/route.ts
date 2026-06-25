import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

const COL = 'openHouseListings';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    const data = snap.data() as Record<string, any>;

    // Prevent the poster from claiming their own opportunity
    if (data.createdByUid === auth.uid || data.agentProfileId === auth.uid) {
      return NextResponse.json(
        { ok: false, error: 'You cannot claim your own open house opportunity' },
        { status: 400 }
      );
    }

    // Prevent double-claiming
    if (data.claimedByUid) {
      return NextResponse.json(
        { ok: false, error: 'This opportunity has already been claimed' },
        { status: 409 }
      );
    }

    const body = await req.json();
    const { claimantName, claimantPhone, claimantEmail, claimedDate, claimedTime, claimedEndTime } = body;

    if (!claimantName || !claimantPhone) {
      return NextResponse.json(
        { ok: false, error: 'claimantName and claimantPhone are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await ref.update({
      claimedByUid: auth.uid,
      claimedByName: claimantName.trim(),
      claimedByPhone: claimantPhone.trim(),
      claimedByEmail: claimantEmail?.trim() || '',
      claimedDate: claimedDate || data.openHouseDate || null,
      claimedTime: claimedTime || data.openHouseTime || '',
      claimedEndTime: claimedEndTime || data.openHouseEndTime || '',
      claimedAt: now,
      updatedAt: now,
    });

    // ── Notify the posting agent ─────────────────────────────────────────────
    try {
      const posterUid = data.createdByUid || data.agentProfileId;
      if (posterUid) {
        const effectiveDate = claimedDate || data.openHouseDate;
        const dateStr = effectiveDate
          ? new Date(effectiveDate + 'T12:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          : '';
        const effectiveTime = claimedTime || data.openHouseTime;
        await sendNotification(adminDb, {
          type: 'open_house_opportunity_claimed',
          recipientUids: [posterUid],
          title: '🏠 Your Open House Opportunity Was Claimed',
          body: [
            `${claimantName} will cover your open house at ${data.address}`,
            dateStr ? `📅 ${dateStr}${effectiveTime ? ` at ${effectiveTime}` : ''}` : '',
            `📞 ${claimantPhone.trim()}`,
            claimantEmail ? `✉️ ${claimantEmail.trim()}` : '',
          ].filter(Boolean).join('\n'),
          data: { openHouseId: params.id, claimantName, address: data.address },
        });
      }
    } catch (notifyErr) {
      console.error('open-house-claim notify error:', notifyErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
