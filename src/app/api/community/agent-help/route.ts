/**
 * /api/community/agent-help
 *
 * GET  — return all active help requests (newest first)
 * POST — create a new help request; broadcasts email + SMS to all active agents
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

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

/** Resolve all Firebase UIDs for active agents so we can broadcast to them. */
async function getAllActiveAgentUids(db: typeof adminDb): Promise<string[]> {
  const uids = new Set<string>();
  try {
    const snap = await db.collection('agentProfiles').where('status', '==', 'active').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      // Prefer firebaseUid field; fall back to doc ID (which may be the UID itself)
      const uid = d.firebaseUid || d.uid || null;
      if (uid) uids.add(uid as string);
    }
  } catch { /* non-fatal */ }
  // Also pull from users collection to catch agents whose profiles may not have firebaseUid set
  try {
    const snap = await db.collection('users').where('role', '==', 'agent').get();
    for (const doc of snap.docs) {
      uids.add(doc.id);
    }
  } catch { /* non-fatal */ }
  return Array.from(uids);
}

export async function GET(_req: NextRequest) {
  try {
    const snap = await adminDb
      .collection(COL)
      .where('status', '==', 'active')
      .get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort by needDate ascending (soonest first), then by createdAt descending
    items.sort((a: any, b: any) => {
      const da = a.needDate || '';
      const db2 = b.needDate || '';
      if (da !== db2) return da < db2 ? -1 : 1;
      return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1;
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
      helpType,        // 'showing' | 'inspection' | 'closing' | 'other'
      description,     // free-text details
      propertyAddress, // optional property address
      needDate,        // ISO date string YYYY-MM-DD
      needTime,        // HH:MM
      compensation,    // numeric dollar amount (0 = no compensation)
      compensationNote,// optional note about compensation
      agentName,
      agentPhone,
      agentEmail,
      agentProfileId,
    } = body;

    if (!helpType || !description || !agentName || !agentPhone) {
      return NextResponse.json(
        { ok: false, error: 'helpType, description, agentName, and agentPhone are required' },
        { status: 400 },
      );
    }

    const VALID_TYPES = new Set(['showing', 'inspection', 'closing', 'other']);
    if (!VALID_TYPES.has(helpType)) {
      return NextResponse.json({ ok: false, error: 'Invalid helpType' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const doc = {
      helpType: helpType.trim(),
      description: description.trim(),
      propertyAddress: propertyAddress?.trim() || '',
      needDate: needDate || null,
      needTime: needTime?.trim() || '',
      compensation: compensation != null ? Number(compensation) : 0,
      compensationNote: compensationNote?.trim() || '',
      agentName: agentName.trim(),
      agentPhone: agentPhone.trim(),
      agentEmail: agentEmail?.trim() || '',
      agentProfileId: agentProfileId || auth.uid,
      createdByUid: auth.uid,
      status: 'active',
      claimedByUid: null,
      claimedByName: null,
      claimedByPhone: null,
      claimedByEmail: null,
      claimedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection(COL).add(doc);

    // ── Broadcast notification to ALL active agents ────────────────────────
    // Fire-and-forget — do not block the response on notification delivery
    void (async () => {
      try {
        const recipientUids = await getAllActiveAgentUids(adminDb);
        if (recipientUids.length > 0) {
          const helpTypeLabel: Record<string, string> = {
            showing: 'Showing Help',
            inspection: 'Inspection Help',
            closing: 'Closing Help',
            other: 'Agent Help',
          };
          const label = helpTypeLabel[helpType] || 'Agent Help';
          const compText = compensation && Number(compensation) > 0
            ? ` — $${Number(compensation)} compensation offered`
            : '';
          const dateText = needDate ? ` on ${needDate}` : '';
          await sendNotification(adminDb, {
            type: 'agent_help_request',
            recipientUids,
            title: `🤝 ${label} Needed — ${agentName}`,
            body: `${agentName} needs help with a ${helpType}${dateText}${compText}. ${description.slice(0, 120)}`,
            url: '/dashboard/tv-mode',
            senderName: agentName,
          });
        }
      } catch (notifErr: any) {
        console.warn('[agent-help] Broadcast notification failed (non-fatal):', notifErr?.message);
      }
    })();

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
