/**
 * POST /api/community/open-houses/[id]/claim
 *
 * Adds a time-slot claim to an open house opportunity.
 * Multiple agents can claim different time windows on the same listing.
 * Overlapping time slots for the same agent are rejected.
 *
 * Body: { claimantName, claimantPhone, claimantEmail?, claimedDate, claimedStartTime, claimedEndTime }
 *
 * DELETE /api/community/open-houses/[id]/claim?claimId=xxx
 * Removes a specific claim (owner of claim or listing owner only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { FieldValue } from 'firebase-admin/firestore';

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

/** Convert "10:00 AM" or "10:00" to minutes-since-midnight for overlap checking */
function toMinutes(t: string): number {
  if (!t) return -1;
  const upper = t.toUpperCase().trim();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const clean = upper.replace(/AM|PM/g, '').trim();
  const [hStr, mStr] = clean.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

/** Returns true if [s1,e1) overlaps [s2,e2) */
function overlaps(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}

/* ── POST — add a claim ──────────────────────────────────────────────────── */
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

    const body = await req.json();
    const { claimantName, claimantPhone, claimantEmail, claimedDate, claimedStartTime, claimedEndTime } = body;

    if (!claimantName || !claimantPhone) {
      return NextResponse.json(
        { ok: false, error: 'claimantName and claimantPhone are required' },
        { status: 400 }
      );
    }
    if (!claimedDate || !claimedStartTime || !claimedEndTime) {
      return NextResponse.json(
        { ok: false, error: 'claimedDate, claimedStartTime, and claimedEndTime are required' },
        { status: 400 }
      );
    }

    const newStart = toMinutes(claimedStartTime);
    const newEnd   = toMinutes(claimedEndTime);
    if (newStart < 0 || newEnd < 0 || newEnd <= newStart) {
      return NextResponse.json(
        { ok: false, error: 'End time must be after start time' },
        { status: 400 }
      );
    }

    // Check for overlapping claims on the same date
    const existingClaims: Array<Record<string, any>> = data.claims || [];
    const sameDayClaims = existingClaims.filter((c) => c.claimedDate === claimedDate);
    for (const c of sameDayClaims) {
      const cs = toMinutes(c.claimedStartTime);
      const ce = toMinutes(c.claimedEndTime);
      if (overlaps(newStart, newEnd, cs, ce)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Time slot conflicts with an existing claim by ${c.claimantName} (${c.claimedStartTime}–${c.claimedEndTime})`,
          },
          { status: 409 }
        );
      }
    }

    const claimId = `${auth.uid}_${Date.now()}`;
    const now = new Date().toISOString();
    const newClaim = {
      claimId,
      claimedByUid: auth.uid,
      claimantName: claimantName.trim(),
      claimantPhone: claimantPhone.trim(),
      claimantEmail: claimantEmail?.trim() || '',
      claimedDate,
      claimedStartTime,
      claimedEndTime,
      claimedAt: now,
    };

    await ref.update({
      claims: FieldValue.arrayUnion(newClaim),
      // Keep legacy single-claim fields for backward compat with TV board
      claimedByUid: auth.uid,
      claimedByName: claimantName.trim(),
      claimedByPhone: claimantPhone.trim(),
      updatedAt: now,
    });

    // ── Notify the posting agent ─────────────────────────────────────────────
    try {
      const posterUid = data.createdByUid || data.agentProfileId;
      if (posterUid) {
        const dateStr = claimedDate
          ? new Date(claimedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';
        await sendNotification(adminDb, {
          type: 'open_house_opportunity_claimed',
          recipientUids: [posterUid],
          title: '🏠 Your Open House Opportunity Was Claimed',
          body: [
            `${claimantName} will cover ${data.address}`,
            dateStr ? `📅 ${dateStr} · ${claimedStartTime}–${claimedEndTime}` : '',
            `📞 ${claimantPhone.trim()}`,
            claimantEmail ? `✉️ ${claimantEmail.trim()}` : '',
          ].filter(Boolean).join('\n'),
          data: { openHouseId: params.id, claimantName, address: data.address },
        });
      }
    } catch (notifyErr) {
      console.error('open-house-claim notify error:', notifyErr);
    }

    return NextResponse.json({ ok: true, claimId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/* ── DELETE — remove a specific claim ───────────────────────────────────── */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const claimId = url.searchParams.get('claimId');
  if (!claimId) return NextResponse.json({ ok: false, error: 'claimId required' }, { status: 400 });

  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    const data = snap.data() as Record<string, any>;
    const claims: Array<Record<string, any>> = data.claims || [];
    const target = claims.find((c) => c.claimId === claimId);
    if (!target) return NextResponse.json({ ok: false, error: 'Claim not found' }, { status: 404 });

    // Only the claimant or the listing owner can remove a claim
    const isListingOwner = data.createdByUid === auth.uid || data.agentProfileId === auth.uid;
    const isClaimOwner   = target.claimedByUid === auth.uid;
    if (!isListingOwner && !isClaimOwner) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const updatedClaims = claims.filter((c) => c.claimId !== claimId);
    const now = new Date().toISOString();

    // If no claims remain, clear the legacy single-claim fields too
    const extraUpdate = updatedClaims.length === 0
      ? { claimedByUid: null, claimedByName: null, claimedByPhone: null }
      : {};

    await ref.update({ claims: updatedClaims, updatedAt: now, ...extraUpdate });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
