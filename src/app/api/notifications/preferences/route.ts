// GET  /api/notifications/preferences — load current user's notification preferences
// PATCH /api/notifications/preferences — save current user's notification preferences
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const DEFAULT_PREFS = {
  in_app: true,
  push: true,
  email: true,
  sms: false,
  events: {},
};

const DEFAULT_TV_PREFS = {
  buyerNeeds:    { in_app: true, email: false, sms: false },
  comingSoon:    { in_app: true, email: false, sms: false },
  openHouseOpps: { in_app: true, email: false, sms: false },
  agentHelp:     { in_app: true, email: false, sms: false },
};

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.exists ? (userDoc.data() as Record<string, any>) : {};
    const prefs = userData.notificationPrefs ?? DEFAULT_PREFS;
    const phone = userData.phone || '';

    // Also load tvNotificationPrefs from agentProfiles (stored there for the broadcast utility)
    let tvNotificationPrefs = userData.tvNotificationPrefs ?? null;
    if (!tvNotificationPrefs) {
      // Try to find by firebaseUid in agentProfiles
      try {
        const profileSnap = await adminDb.collection('agentProfiles')
          .where('firebaseUid', '==', uid)
          .limit(1)
          .get();
        if (!profileSnap.empty) {
          tvNotificationPrefs = profileSnap.docs[0].data().tvNotificationPrefs ?? null;
        }
      } catch { /* ignore */ }
    }

    // Also load txNotificationPrefs
    const txNotificationPrefs = userData.txNotificationPrefs ?? null;

    return NextResponse.json({ ok: true, prefs, phone, tvNotificationPrefs, txNotificationPrefs });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await req.json();
    const { prefs, phone, tvNotificationPrefs, txNotificationPrefs } = body;
    if (!prefs || typeof prefs !== 'object') {
      return jsonError(400, 'Invalid preferences payload');
    }

    // Normalise legacy camelCase keys (inApp -> in_app) so the backend always
    // reads a consistent schema regardless of which UI saved the prefs.
    const normalisedPrefs: Record<string, any> = { ...prefs };
    if ('inApp' in normalisedPrefs && !('in_app' in normalisedPrefs)) {
      normalisedPrefs.in_app = normalisedPrefs.inApp;
    }
    delete normalisedPrefs.inApp; // remove legacy key

    // Build update payload — always save prefs, optionally save phone and tvPrefs
    const update: Record<string, any> = {
      notificationPrefs: normalisedPrefs,
      updatedAt: new Date().toISOString(),
    };
    if (typeof phone === 'string') {
      update.phone = phone.trim();
    }
    if (tvNotificationPrefs && typeof tvNotificationPrefs === 'object') {
      update.tvNotificationPrefs = tvNotificationPrefs;
    }
    if (txNotificationPrefs && typeof txNotificationPrefs === 'object') {
      update.txNotificationPrefs = txNotificationPrefs;
    }

    // Merge into the users/{uid} document
    await adminDb.collection('users').doc(uid).set(update, { merge: true });

    // Also save tvNotificationPrefs to agentProfiles so broadcastTvPost can read it
    if (tvNotificationPrefs && typeof tvNotificationPrefs === 'object') {
      try {
        // Try by firebaseUid field
        const profileSnap = await adminDb.collection('agentProfiles')
          .where('firebaseUid', '==', uid)
          .limit(1)
          .get();
        if (!profileSnap.empty) {
          await profileSnap.docs[0].ref.set({ tvNotificationPrefs }, { merge: true });
        } else {
          // Try by doc ID
          const byId = await adminDb.collection('agentProfiles').doc(uid).get();
          if (byId.exists) {
            await byId.ref.set({ tvNotificationPrefs }, { merge: true });
          }
        }
      } catch (e) {
        console.error('[preferences] Failed to sync tvNotificationPrefs to agentProfiles:', e);
        // Non-fatal — the users doc was already updated
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
