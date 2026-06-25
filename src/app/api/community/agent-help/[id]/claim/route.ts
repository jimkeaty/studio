/**
 * /api/community/agent-help/[id]/claim
 *
 * POST — claim an open help request.
 *   - Marks the request as claimed with the claimant's info.
 *   - Notifies the requesting agent via in-app, email, and SMS.
 *   - The request remains visible (status stays 'active') so others can see it
 *     is taken, but the claimedByName / claimedAt fields are populated.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getAgentUid } from '@/lib/notifications/getRecipientUids';

const COL = 'agentHelpRequests';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    const data = snap.data() as Record<string, any>;

    if (data.status !== 'active') {
      return NextResponse.json({ ok: false, error: 'This request is no longer active' }, { status: 409 });
    }

    // Prevent the poster from claiming their own request
    if (data.createdByUid === auth.uid || data.agentProfileId === auth.uid) {
      return NextResponse.json({ ok: false, error: 'You cannot claim your own help request' }, { status: 400 });
    }

    const body = await req.json();
    const { claimantName, claimantPhone, claimantEmail, claimantProfileId } = body;

    if (!claimantName || !claimantPhone) {
      return NextResponse.json({ ok: false, error: 'claimantName and claimantPhone are required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Mark as claimed — keep status 'active' so it stays visible on the board
    // but set claimedByUid so the UI can show "Claimed by X"
    await ref.update({
      claimedByUid: auth.uid,
      claimedByName: claimantName.trim(),
      claimedByPhone: claimantPhone.trim(),
      claimedByEmail: claimantEmail?.trim() || '',
      claimedByProfileId: claimantProfileId || auth.uid,
      claimedAt: now,
      updatedAt: now,
    });

    // ── Notify the requesting agent ────────────────────────────────────────
    void (async () => {
      try {
        const requesterUid = await getAgentUid(adminDb, data.agentProfileId, data.createdByUid);
        if (requesterUid) {
          const helpTypeLabel: Record<string, string> = {
            showing: 'showing',
            inspection: 'inspection',
            closing: 'closing',
            other: 'help request',
          };
          const label = helpTypeLabel[data.helpType] || 'help request';
          await sendNotification(adminDb, {
            type: 'agent_help_claimed',
            recipientUids: [requesterUid],
            title: `✅ Your ${label} request has been claimed!`,
            body: `${claimantName} has claimed your ${label} request${data.needDate ? ` for ${data.needDate}` : ''}. They will reach out at ${claimantPhone}.`,
            url: '/dashboard/tv-mode',
            senderName: claimantName,
          });
        }
      } catch (notifErr: any) {
        console.warn('[agent-help/claim] Notification failed (non-fatal):', notifErr?.message);
      }
    })();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
