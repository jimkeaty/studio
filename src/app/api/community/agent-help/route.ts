/**
 * /api/community/agent-help
 *
 * GET  — return all active help requests (newest first)
 * POST — create a new help request; broadcasts email + SMS to all active agents
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { broadcastTvPost } from '@/lib/notifications/broadcastTvPost';

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
      postToFacebook,  // boolean — share to KRE Agents Facebook Group
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

    // ── Broadcast to agents who opted in to Agent Help notifications (fire-and-forget)
    void (() => {
      const helpTypeLabel: Record<string, string> = {
        showing: 'Showing Help',
        inspection: 'Inspection Help',
        closing: 'Closing Help',
        other: 'Agent Help',
      };
      const label = helpTypeLabel[helpType] || 'Agent Help';
      const compText = compensation && Number(compensation) > 0
        ? ` · 💵 $${Number(compensation)} offered`
        : '';
      const dateText = needDate ? ` · 📅 ${needDate}${needTime ? ` at ${needTime}` : ''}` : '';
      return broadcastTvPost(adminDb, {
        postType: 'agentHelp',
        postId: ref.id,
        agentName,
        excludeUid: auth.uid,
        description: `${label}${dateText}${compText} · ${description.slice(0, 100)}`,
      }).catch((e) => console.warn('[agent-help] broadcastTvPost error:', e));
    })();

    // ── Facebook Group post (non-fatal) ────────────────────────────────────────────────────
    if (postToFacebook) {
      void (async () => {
        try {
          const userDoc = await adminDb.collection('users').doc(auth.uid).get();
          const userData = userDoc.data() || {};
          const fbToken = userData.facebookToken as string | undefined;
          const fbExpiresAt = userData.facebookTokenExpiresAt as string | undefined;
          if (fbToken && (!fbExpiresAt || new Date(fbExpiresAt) > new Date())) {
            const helpTypeLabel: Record<string, string> = {
              showing: 'Showing',
              inspection: 'Inspection',
              closing: 'Closing',
              other: 'Help',
            };
            const label = helpTypeLabel[helpType] || 'Help';
            const compText = compensation && Number(compensation) > 0
              ? `\nCompensation: $${Number(compensation)}${compensationNote ? ` (${compensationNote})` : ''}`
              : '';
            const dateText = needDate ? `\nDate Needed: ${needDate}${needTime ? ` at ${needTime}` : ''}` : '';
            const fbMessage = [
              `🤝 AGENT HELP NEEDED — ${agentName}`,
              ``,
              `Type: ${label}`,
              propertyAddress ? `Property: ${propertyAddress}` : '',
              dateText ? dateText.trim() : '',
              compText ? compText.trim() : '',
              ``,
              description.trim(),
              ``,
              `Contact: ${agentPhone}`,
              `#KREAgents #AgentHelp`,
            ].filter(Boolean).join('\n');
            const FACEBOOK_GROUP_ID = process.env.FACEBOOK_GROUP_ID || '1590583281249545';
            const fbRes = await fetch(
              `https://graph.facebook.com/v19.0/${FACEBOOK_GROUP_ID}/feed`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: fbMessage, access_token: fbToken }),
              }
            );
            const fbData = await fbRes.json();
            if (fbData.error) {
              console.error('[agent-help] Facebook post error:', fbData.error);
              if (fbData.error.code === 190 || fbData.error.code === 200) {
                await adminDb.collection('users').doc(auth.uid).update({ facebookToken: null, facebookTokenExpiresAt: null });
              }
            } else {
              await adminDb.collection('facebookPosts').add({
                uid: auth.uid,
                postType: 'agent_needed',
                groupId: FACEBOOK_GROUP_ID,
                fbPostId: fbData.id || '',
                messagePreview: fbMessage.slice(0, 200),
                sourceAgentHelpId: ref.id,
                postedAt: new Date().toISOString(),
              });
            }
          } else {
            console.warn(`[agent-help] Facebook post requested but token missing/expired for uid=${auth.uid}`);
          }
        } catch (fbErr) {
          console.error('[agent-help] Facebook post failed (non-fatal):', fbErr);
        }
      })();
    }

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
