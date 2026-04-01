/**
 * POST /api/notifications/send
 *
 * Sends a Firebase Cloud Messaging push notification to one or more agents.
 * Called server-side when:
 *   - A deal is approved/submitted
 *   - An agent crosses a commission tier threshold
 *   - An agent reaches a goal milestone (50%, 75%, 100%)
 *   - A broker sends a team broadcast
 *
 * Body:
 *   {
 *     type: 'deal_submitted' | 'tier_upgrade' | 'goal_milestone' | 'broadcast',
 *     recipientUids: string[],   // Firebase Auth UIDs to notify
 *     title: string,
 *     body: string,
 *     url?: string,              // Deep link to open on click
 *     data?: Record<string, string>,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  // Authenticate — must be admin or server-to-server call
  const token = extractBearer(req);
  if (!token) return jsonError(401, 'Missing authorization token');

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  const isAdmin = await isAdminLike(callerUid);
  if (!isAdmin) return jsonError(403, 'Admin access required');

  const body = await req.json();
  const { type, recipientUids, title, body: msgBody, url, data } = body;

  if (!recipientUids?.length || !title || !msgBody) {
    return jsonError(400, 'recipientUids, title, and body are required');
  }

  // Look up FCM tokens for each recipient from Firestore
  const results: { uid: string; status: 'sent' | 'no_token' | 'error'; token?: string }[] = [];

  for (const uid of recipientUids as string[]) {
    try {
      const tokenDoc = await adminDb.collection('fcmTokens').doc(uid).get();
      if (!tokenDoc.exists) {
        results.push({ uid, status: 'no_token' });
        continue;
      }

      const fcmToken = tokenDoc.data()?.token as string;
      if (!fcmToken) {
        results.push({ uid, status: 'no_token' });
        continue;
      }

      // Send via FCM REST API (v1)
      // Note: For production, use firebase-admin's messaging.send()
      // We use the admin SDK's messaging here
      const { getMessaging } = await import('firebase-admin/messaging');
      const messaging = getMessaging();

      await messaging.send({
        token: fcmToken,
        notification: {
          title,
          body: msgBody,
        },
        webpush: {
          notification: {
            title,
            body: msgBody,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: type || 'smart-broker',
            renotify: true,
            requireInteraction: type === 'tier_upgrade' || type === 'goal_milestone',
          },
          fcmOptions: {
            link: url || '/dashboard',
          },
        },
        data: {
          type: type || 'system',
          url: url || '/dashboard',
          ...(data || {}),
        },
      });

      results.push({ uid, status: 'sent', token: fcmToken.slice(0, 10) + '...' });

      // Log the notification to Firestore for the notification bell
      await adminDb.collection('notifications').add({
        recipientUid: uid,
        type: type || 'system',
        title,
        body: msgBody,
        url: url || '/dashboard',
        read: false,
        createdAt: new Date(),
        sentBy: callerUid,
      });

    } catch (err) {
      console.error(`[FCM] Failed to send to ${uid}:`, err);
      results.push({ uid, status: 'error' });
    }
  }

  const sent = results.filter((r) => r.status === 'sent').length;
  const failed = results.filter((r) => r.status !== 'sent').length;

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    results,
  });
}
